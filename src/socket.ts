import { AbortError, FutureCancelled, NetworkError } from "./errors";
import { HTTPStatus } from "./networking/decorators";
import { Stream } from "./stream";
import { Future, WaitPeriod } from "./future";
import { Decoder } from "./data/decoders";
import { FutureEvent, Lock } from "./synchronize";
import { ExecutorState } from "./stream/state";
import WebSocket from "modern-isomorphic-ws";
import { Queue } from "./data-structures/object";
import { Pair, pair } from "./data-structures/array/Pair";

type SocketFunctor<T extends CloseEvent | Event | MessageEvent> = (this: WebSocket, evt: T) => any;

interface WebSocketConfiguration {
  retryOnDisconnect?: boolean;
  cacheSize?: number;
  cacheExpiryPeriod?: WaitPeriod;
  exponentialFactor?: number;
  backoffPeriodMs?: number;
}

/**
 * Future-based web sockets
 */
export class StreamableWebSocket<T> {
  private readonly retryOnDisconnect: boolean;

  private openFuture?: Future<void>;

  private closeFuture?: Future<void>;

  private socketListeners: Array<[keyof WebSocketEventMap, SocketFunctor<any>]>;

  private messageQueues: Array<T[] | Pair<Queue<T>, (v: T) => boolean>>;

  private readonly url: string;

  private socket?: WebSocket;

  private manuallyClosed: boolean;

  private readonly cacheSize: number;

  private readonly backoffPeriodMs: number;

  private readonly exponentialFactor: number;

  private readonly signal: AbortSignal;

  private backoffPeriods: number;

  private readonly evt: EventTarget;

  private readonly dataReadyEvent: FutureEvent;

  private readonly listenerAvailableEvent: FutureEvent;

  private readonly dataProcessingLock: Lock;

  readonly decoder: Decoder<T>;

  constructor(
    url: string,
    decoder: Decoder<T>,
    { retryOnDisconnect, cacheSize, cacheExpiryPeriod, exponentialFactor, backoffPeriodMs }: WebSocketConfiguration = {}
  ) {
    this.signal = new AbortController().signal;
    this.decoder = decoder;
    this.socketListeners = [];
    this.url = url;
    this.cacheSize = cacheSize ?? 10000;
    this.manuallyClosed = false;
    this.retryOnDisconnect = retryOnDisconnect ?? true;
    this.exponentialFactor = exponentialFactor ?? 2;
    this.backoffPeriodMs = backoffPeriodMs ?? 10;
    this.backoffPeriods = -1;
    this.messageQueues = [];
    this.evt = new EventTarget();
    this.dataReadyEvent = new FutureEvent();
    this.listenerAvailableEvent = new FutureEvent();
    this.dataProcessingLock = new Lock();
  }

  get opened() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  get closed() {
    return this.socket && this.socket.readyState === WebSocket.CLOSED;
  }

  /**
   * opens the current web socket connection
   */
  open() {
    if (!this.openFuture || this.openFuture?.failed) {
      this.closeFuture = new Future<void>((resolve, reject, signal) => {
        this.signal.addEventListener("abort", () => {
          resolve();
        });
        signal.onabort = () => {
          this.signal.removeEventListener("abort", resolve as any);
          reject(new AbortError());
        };
      }).schedule();
      this.openFuture = new Future<void>((resolve, reject, signal) => {
        signal.onabort = () => {
          this.close();
        };
        let retrying = false;
        const cancelError = this.addEventListener("error", async () => {
          if (this.retryOnDisconnect && !signal.aborted) {
            retrying = true;
            this.getSocket()?.close();
            await Future.sleep({
              milliseconds: this.backoffPeriodMs * Math.pow(this.exponentialFactor, ++this.backoffPeriods),
            });
            this.createSocket();
          } else {
            retrying = false;
            cancelError();
            cancelOpen();
            reject(new NetworkError(HTTPStatus.EXPECTATION_FAILED));
            this.getSocket()?.close();
          }
        });
        const cancelOpen = this.addEventListener("open", () => {
          this.backoffPeriods = -1;
          retrying = false;
          resolve();
          cancelError();
          cancelOpen();
        });
        const cancelClose = this.addEventListener("close", () => {
          if (retrying) return;
          if (!this.manuallyClosed && this.retryOnDisconnect && !signal.aborted) {
            delete this.openFuture;
            cancelError();
            cancelOpen();
            cancelClose();
            this.open()
              .thenApply(() => resolve())
              .catch(reject);
          } else {
            retrying = false;
            this.signal.dispatchEvent(new CustomEvent("abort"));
            cancelQueue();
            reject(new NetworkError(HTTPStatus.EXPECTATION_FAILED));
          }
        });
        const cancelQueue = this.addEventListener("message", (evt: MessageEvent) =>
          this.dataProcessingLock
            .with(async () => {
              const data =
                typeof evt.data === "string" || evt.data instanceof ArrayBuffer
                  ? new Blob([evt.data])
                  : (evt.data as Blob);
              let result = this.decoder.decode(data);

              if (result instanceof Future || result instanceof Promise) {
                result = await result;
              }

              if (this.messageQueues.length === 0) {
                this.listenerAvailableEvent.clear();
                await this.listenerAvailableEvent.wait();
              }

              for (const value of this.messageQueues) {
                if (value instanceof Pair && value.second(result)) {
                  value.first.enqueue(result);
                } else if (Array.isArray(value)) {
                  value.push(result);
                }
              }

              this.dataReadyEvent.set();
            })
            .run()
        );
        this.createSocket();
      });
    }

    return this.openFuture;
  }

  /**
   * Wait for the socket connection closed.
   * @remark
   * This doesn't actually attempt to close the socket, only waits for the connection to close
   */
  closedFuture() {
    if (this.closeFuture) return this.closeFuture;
    throw new NetworkError(HTTPStatus.FORBIDDEN, "Stream not opened");
  }

  /**
   * Closes the socket if currently open
   */
  close() {
    this.manuallyClosed = true;
    this.getSocket()?.close();
    this.messageQueues = [];
    this.signal.dispatchEvent(new CustomEvent("abort"));
  }

  /**
   * Sends data via socket
   * @param data
   */
  async send(data: string | ArrayBufferView | Blob | ArrayBufferLike) {
    this.getSocket()?.send(data instanceof Blob ? await data.arrayBuffer() : data);
  }

  streamView(lens: (v: T) => boolean, objectMaxSize?: number, expiryPeriod?: WaitPeriod): Stream<T> {
    const queue = new Queue<T>(objectMaxSize, expiryPeriod);
    const tuple = pair(queue, lens);
    this.messageQueues.push(tuple);
    this.listenerAvailableEvent.set();
    return queue.streamEntries.cancelOnSignal(this.signal).onCompletion(() => {
      this.messageQueues = this.messageQueues.filter((v) => v !== tuple);
    });
  }

  /**
   * Gets the stream for messages received via this socket
   */
  stream(): Stream<T> {
    const queue = [];
    this.messageQueues.push(queue);
    this.listenerAvailableEvent.set();
    return new Stream<T>((signal) => {
      const data = queue.shift();
      if (data === undefined) {
        this.dataReadyEvent.clear();
        return this.dataReadyEvent
          .wait()
          .thenApply(() => queue.shift())
          .catch((error) => {
            if (error instanceof FutureCancelled) {
              return new ExecutorState(true);
            }

            throw error;
          })
          .registerSignal(signal);
      }
      return data;
    })
      .cancelOnSignal(this.signal)
      .onCompletion(() => {
        this.messageQueues = this.messageQueues.filter((v) => v !== queue);
      });
  }

  private addEventListener<T extends CloseEvent | Event | MessageEvent>(
    type: keyof WebSocketEventMap,
    functor: SocketFunctor<T>
  ) {
    this.socketListeners.push([type, functor]);
    if (this.socket) {
      this.socket.addEventListener(type as any, functor as any);
    }

    return () => {
      this.socketListeners = this.socketListeners.filter(([t, f]) => f !== functor && t !== type);
      if (this.socket) this.socket.removeEventListener(type as any, functor as any);
    };
  }

  private createSocket() {
    const socket = new WebSocket(this.url);
    socket.binaryType = "arraybuffer";
    this.socketListeners.forEach(([type, functor]) => socket.addEventListener(type as any, functor));
    this.socket = socket;
    return socket;
  }

  private getSocket() {
    return this.socket;
  }
}
