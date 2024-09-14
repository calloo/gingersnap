import { NetworkService } from "./NetworkService";
import { StreamableWebSocket } from "../socket";
import { ServiceInternalProps } from "./types";
import * as R from "ramda";
import { CallExecutionError, ParsingError } from "../errors";
import { Stream } from "../stream";
import { Future, FutureResult } from "../future";
import { JSONDecoder } from "../data/decoders";
import { Model } from "../data/model";
import { GingerSnapProps } from "./index";

export class WebSocketService extends NetworkService {
  private readonly socket: StreamableWebSocket<any>;

  constructor({ decoder, ...other }: GingerSnapProps = {}) {
    super(other ?? {});
    const internals: ServiceInternalProps = (this as any).__internal__;
    this.socket = new StreamableWebSocket(
      this.baseUrl,
      decoder ?? (internals.classConfig.Decoder ? new internals.classConfig.Decoder() : new JSONDecoder())
    );
  }

  get connected() {
    return this.socket.opened;
  }

  /**
   * Called when socket connection is closed
   * @protected
   */
  protected onceConnectionClosed() {}

  /**
   * Shutdown the socket connection
   */
  async shutdown() {
    this.socket.close();
    this.onceConnectionClosed();
    await this.socket.closedFuture();
  }

  /**
   * Awaits socket closed
   */
  closedFuture() {
    return this.socket.closedFuture();
  }

  ready() {
    return Future.shield(this.socket.open());
  }

  protected __setup__(): void {
    const internals: ServiceInternalProps = (this as any).__internal__;
    if (this.socket.decoder.load) {
      this.socket.decoder.load();
    }
    const socketMethods = R.filter(
      ([_, v]) => (v.socketReadStream ?? v.socketWriteStream ?? v.socketRequestReply) !== undefined,
      R.toPairs(internals.methodConfig)
    );
    R.forEach(([key, config]) => {
      const oldMethod = this[key];
      const details = internals.methodConfig[key]?.socketReadStream;
      let dataComparator = (v: any) => false;

      if (config.socketReadStream) {
        if (!details) throw new ParsingError([], "ReadStreamDetailsMissing");
        if (!config.responseClass) throw new ParsingError([], "ResponseTypeMissing");
        let equalsChecker: any;

        switch (typeof details.value) {
          case "boolean":
            equalsChecker = R.equals(Boolean(details.value));
            break;
          case "string":
            equalsChecker = R.equals(String(details.value));
            break;
          case "number":
            equalsChecker = R.equals(Number(details.value));
            break;
          default:
            if (details.value instanceof RegExp) equalsChecker = details.value.test;
            else equalsChecker = R.equals(details.value);
        }
        dataComparator = R.compose(
          (v) => equalsChecker(v),
          R.view(
            typeof details.keyPath === "string" ? R.lensProp<any, any>(details.keyPath) : R.lensPath(details.keyPath)
          )
        );
      }

      // TODO add caching for websockets
      // const cacheInfo = config.cache;
      // let cache: Cache<string, ArrayBuffer> | undefined;
      //
      // if (cacheInfo) {
      //   cache = this.cacheManager.createCache(
      //     this.baseUrl,
      //     cacheInfo.persist,
      //     async (buffer) => JSON.stringify(new Uint8Array(buffer)),
      //     (v) => Uint8Array.of(JSON.parse(v)).buffer,
      //     undefined,
      //     cacheInfo.duration
      //   );
      // }

      this[key] = (body?: any) => {
        if (config.socketRequestReply) {
          const guid = config.socketRequestReply.guidGen();
          const lens = R.lensPath(config.socketRequestReply.guidPath);

          return Stream.seed(() =>
            Future.of(async () => {
              if (!this.socket.opened) {
                await this.socket.open();
              }
              let data: any = body;
              if (body instanceof Model) {
                data = body.object();
              }

              data = R.set(lens, guid, data);
              await this.socket.send(JSON.stringify(data));
              return 1;
            })
          )
            .map(() =>
              this.socket.streamView(
                R.compose(R.equals(guid), R.view(lens)),
                config.socketRequestReply.objectMaxSize,
                config.socketRequestReply.expiryPeriod
              )
            )
            .map((data) => {
              if (config.responseClass.prototype instanceof Model) {
                const ModelClass = config.responseClass as typeof Model;
                return ModelClass.fromJSON(data);
              }
              return config.responseClass(data);
            })
            .flatten()
            .map(async (v) => {
              let result = oldMethod(v);
              if (result === null || result === undefined) return v;
              if (result instanceof Promise) result = await result;
              if (result instanceof FutureResult) result = result.value;

              return result;
            });
        } else if (config.socketWriteStream) {
          if (body === undefined || body === null)
            throw new CallExecutionError("Empty body detected for a write stream");
          return new Stream(async (signal) => {
            if (!this.socket.opened) {
              await this.socket.open();
            }

            if (body instanceof Model) {
              await this.socket.send(body.blob());
            } else if (body instanceof ArrayBuffer || body instanceof Blob) {
              await this.socket.send(body);
            } else {
              await this.socket.send(JSON.stringify(body));
            }
            const result = oldMethod();
            if (result instanceof Promise) {
              await result;
            }
            return null;
          }).once();
        } else {
          let stream = this.socket.streamView(dataComparator);
          if (config.socketReadStream?.skip !== undefined) stream = stream.skip(config.socketReadStream.skip);
          if (config.socketReadStream?.take !== undefined) stream = stream.take(config.socketReadStream.take);

          return stream
            .map((data) => {
              if (config.responseClass.prototype instanceof Model) {
                const ModelClass = config.responseClass as typeof Model;
                return ModelClass.fromJSON(data);
              }
              return config.responseClass(data);
            })
            .flatten()
            .map(async (v) => {
              let result = oldMethod(v);
              if (result === null || result === undefined) return v;
              if (result instanceof Promise) result = await result;
              if (result instanceof FutureResult) result = result.value;

              return result;
            });
        }
      };
    }, socketMethods);

    if (!this.socket.opened) {
      void this.socket.open();
    }

    const originalMethodConfig = internals.methodConfig;
    internals.methodConfig = R.fromPairs(
      R.filter(([_, v]) => !(v.socketReadStream && v.socketWriteStream), R.toPairs(internals.methodConfig))
    );
    super.__setup__();
    internals.methodConfig = originalMethodConfig;
  }
}
