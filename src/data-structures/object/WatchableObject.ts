import { WaitableObject } from "./WaitableObject";
import { Future, WaitPeriod } from "../../future";
import { Stream } from "../../stream";
import * as R from "ramda";
import { SimpleQueue } from "./SimpleQueue";
import { FutureEvent } from "../../synchronize";
import { ExecutorState } from "../../stream/state";

type GetListener<T> = (property: T) => void;
type SetListener<T, K> = (property: T, oldValue: K | undefined, newValue: K) => void | Promise<void>;
type DeleteListener<T, K> = (property: T, oldValue: K | undefined) => void;

export interface WatchableChange<T, K> {
  type: WatchableObjectOperations.SET | WatchableObjectOperations.CLEAR | WatchableObjectOperations.DELETE;
  oldValue?: K;
  newValue?: K;
  key: T;
}

export interface Configuration {
  entryThreshold: number;
}

export enum WatchableObjectOperations {
  DELETE,
  GET,
  SET,
  CLEAR,
  VALUES,
}

export class WatchableObject<T, K> extends WaitableObject<T, K> {
  private getListeners: Array<GetListener<T>>;

  private setListeners: Array<SetListener<T, K>>;

  private deleteListeners: Array<DeleteListener<T, K>>;

  private clearListeners: Array<() => void>;

  private valuesListeners: Array<() => void>;

  constructor(objectMaxSize?: number, expiryPeriod?: WaitPeriod) {
    super(objectMaxSize, expiryPeriod);
    this.getListeners = [];
    this.setListeners = [];
    this.deleteListeners = [];
    this.clearListeners = [];
    this.valuesListeners = [];
  }

  /**
   * Ingest data from the given stream into the queue. The future returned is
   * already scheduled to execute in the background. However, you can cancel
   * ingestion at anytime by cancelling the returned future
   *
   * Important Note:
   * - Cancelling the ingestion does not kill the stream, only stops
   * monitoring the stream for incoming data
   * - If ingestion is cancelled and data had been retrieved at that period, the
   * data will discarded
   * @param stream input data stream
   * @param keyExtractor used to get the key for storing the incoming data
   */
  ingest(stream: Stream<K>, keyExtractor: (v: K) => T): Future<void> {
    return this.ingestStream(stream, (data) => this.set(keyExtractor(data), data));
  }

  clone() {
    return super.clone() as WatchableObject<T, K>;
  }

  /**
   * Stream of changes made to the object via SET, DELETE or CLEAR commands
   */
  changeStream() {
    const evt = new FutureEvent();
    const queue = new SimpleQueue<WatchableChange<T, K>>();
    const cancelSet = this.onSet((key, oldValue, newValue) => {
      queue.enqueue({
        type: WatchableObjectOperations.SET,
        key,
        oldValue,
        newValue,
      });
      evt.set();
    });
    const cancelDelete = this.onDelete((key, oldValue) => {
      queue.enqueue({
        type: WatchableObjectOperations.DELETE,
        key,
        oldValue,
      });
      evt.set();
    });
    const cancelClear = this.onClear(() => {
      queue.enqueue({
        type: WatchableObjectOperations.CLEAR,
        key: "*" as any,
      });
      evt.set();
    });
    const cleanup = R.once(() => {
      cancelClear();
      cancelSet();
      cancelDelete();
    });

    return new Stream<WatchableChange<T, K>>(async (signal) => {
      signal.onabort = cleanup;
      while (queue.empty && !signal.aborted) {
        await evt.wait();
        evt.clear();
      }

      if (signal.aborted) {
        return new ExecutorState(true);
      }
      return queue.dequeue();
    });
  }

  /**
   * Listens whenever a value is retrieved from this object
   * @param listener
   * @returns unsubscribe function
   */
  onGet(listener: GetListener<T>) {
    this.getListeners.push(listener);
    return () => {
      this.getListeners = this.getListeners.filter((v) => v !== listener);
    };
  }

  /**
   * Listens whenever a property is added or updated on this object
   * @param listener
   * @returns unsubscribe function
   */
  onSet(listener: SetListener<T, K>) {
    this.setListeners.push(listener);
    return () => {
      this.setListeners = this.setListeners.filter((v) => v !== listener);
    };
  }

  /**
   * Listens whenever a property is deleted from this object
   * @param listener
   * @returns unsubscribe function
   */
  onDelete(listener: DeleteListener<T, K>) {
    this.deleteListeners.push(listener);
    return () => {
      this.deleteListeners = this.deleteListeners.filter((v) => v !== listener);
    };
  }

  /**
   * Listens whenever this object is wiped clean
   * @param listener
   * @returns unsubscribe function
   */
  onClear(listener: () => void) {
    this.clearListeners.push(listener);
    return () => {
      this.clearListeners = this.clearListeners.filter((v) => v !== listener);
    };
  }

  /**
   * Listens whenever the values() method is invoked on this object
   * @param listener
   * @returns unsubscribe function
   */
  onValues(listener: () => void) {
    this.valuesListeners.push(listener);
    return () => {
      this.valuesListeners = this.valuesListeners.filter((v) => v !== listener);
    };
  }

  get(key: T, defaultValue?: K | undefined) {
    Future.sleep(1)
      .thenApply(() => this.getListeners.forEach((listener) => listener(key)))
      .run();
    return super.get(key, defaultValue);
  }

  set(key: T, value: K, expiryPeriod?: WaitPeriod) {
    const oldValue = this.get(key);
    super.set(key, value, expiryPeriod);
    this.setListeners.forEach((listener) => listener(key, oldValue, value));
  }

  delete(key: T) {
    const oldValue = this.get(key);
    super.delete(key);
    if (oldValue !== undefined) this.deleteListeners.forEach((listener) => listener(key, oldValue));
  }

  clear() {
    super.clear();
    this.clearListeners.forEach((listener) => listener());
  }

  await(key: T, abort?: AbortSignal) {
    return super.await(key, abort).thenApply((value) => {
      Future.sleep(1)
        .thenApply(() => this.getListeners.forEach((listener) => listener(key)))
        .run();
      return value.value;
    }) as Future<K>;
  }

  on(key: T, callback: (value: K) => void, multiCall = true) {
    return super.on(
      key,
      (v) => {
        Future.sleep(1)
          .thenApply(() => this.getListeners.forEach((listener) => listener(key)))
          .run();
        callback(v);
      },
      multiCall
    );
  }

  values(copy?: boolean) {
    Future.sleep(1)
      .thenApply(() => this.valuesListeners.forEach((listener) => listener()))
      .run();
    return super.values(copy);
  }

  protected ingestStream(stream: Stream<K>, handler: (v: K) => void): Future<void> {
    return Future.of<void>(async (_, __, signal) => {
      for await (const data of stream) {
        while (!signal.aborted && this.objectMaxSize && this.size() === this.objectMaxSize) {
          await Future.of((resolve, _, signal) => {
            const cancel = this.onDelete(() => {
              cancel();
              resolve(null);
            });
            signal.onabort = cancel;
          }).registerSignal(signal);
        }

        if (signal.aborted) {
          break;
        }
        handler(data);
      }
    }).schedule();
  }
}
