import { NetworkService } from "./NetworkService";
import { ServiceInternalProps } from "./types";
import * as R from "ramda";
import { CallExecutionError } from "../errors";
import { FutureEvent } from "../synchronize";
import { FutureResult } from "../future";
import { Stream } from "../stream";
import { Model } from "../data/model";
import { GingerSnapProps } from "./index";

export class EventSourceService extends NetworkService {
  private readonly evtSource: EventSource;

  constructor(config: GingerSnapProps = {}) {
    super(config);
    this.evtSource = new EventSource(this.baseUrl);
  }

  /**
   * Shutdown the event source connection
   */
  async shutdown() {
    this.evtSource.close();
  }

  protected __setup__(): void {
    const internals: ServiceInternalProps = (this as any).__internal__;
    const socketMethods = R.filter(([_, v]) => v.socketReadStream !== undefined, R.toPairs(internals.methodConfig));

    R.forEach(([key, config]) => {
      const oldMethod = this[key];
      const details = internals.methodConfig[key]?.socketReadStream;
      if (!details) {
        throw new CallExecutionError("ReadStream details is missing for EventSource");
      }

      this[key] = () => {
        const queue: string[] = [];
        const dataReadyEvt = new FutureEvent();
        this.evtSource.addEventListener(
          details.keyPath instanceof Array ? details.keyPath.join(".") : details.keyPath,
          (evt) => {
            queue.push(evt.data);
            dataReadyEvt.set();
          }
        );
        let stream = new Stream<string>(async () => {
          if (queue.length === 0) {
            dataReadyEvt.clear();
            await dataReadyEvt.wait();
          }
          return queue.shift();
        });

        if (config.socketReadStream?.skip !== undefined) stream = stream.skip(config.socketReadStream.skip);
        if (config.socketReadStream?.take !== undefined) stream = stream.take(config.socketReadStream.take);

        return stream
          .map((data) => {
            if (config.responseClass.prototype instanceof Model) {
              const ModelClass = config.responseClass as typeof Model;
              return ModelClass.fromString(data, config.dataFormat);
            }
            return config.responseClass(data, config.dataFormat);
          })
          .flatten()
          .map(async (v) => {
            let result = oldMethod(v);
            if (result === null || result === undefined) return v;
            if (result instanceof Promise) result = await result;
            if (result instanceof FutureResult) result = result.value;

            return result;
          });
      };
    }, socketMethods);

    const originalMethodConfig = internals.methodConfig;
    internals.methodConfig = R.fromPairs(
      R.filter(([_, v]) => !(v.socketReadStream && v.socketWriteStream), R.toPairs(internals.methodConfig))
    );
    super.__setup__();
    internals.methodConfig = originalMethodConfig;
  }
}
