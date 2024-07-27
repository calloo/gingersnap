import { Future } from "../future";
import { FutureEvent, Lock } from "../synchronize";
import { Stream } from "../stream";
import { ValueDestroyedError } from "../errors/ValueDestroyedError";
import { ExecutorState } from "../stream/state";

export class AtomicValue<T> {
  private value: T | undefined;
  private closed: boolean;
  private readonly setEvt: FutureEvent;
  private readonly setLock: Lock;

  constructor() {
    this.setEvt = new FutureEvent();
    this.setLock = new Lock();
    this.closed = false;
  }

  set(value: T): Future<void> {
    return this.setLock.with(async () => {
      if (this.closed) {
        throw new ValueDestroyedError();
      }
      this.value = value;
      this.setEvt.set();
    });
  }

  get(): Future<T> {
    return this.read(false);
  }

  pop(): Future<T> {
    return this.read(true);
  }

  destroy() {
    this.closed = true;
  }

  get stream(): Stream<T> {
    return new Stream((signal) =>
      this.pop()
        .catch((error) => {
          if (error instanceof ValueDestroyedError) {
            return new ExecutorState(true);
          }
          throw error;
        })
        .registerSignal(signal)
    );
  }

  private read(removeValue: boolean): Future<T> {
    return Future.of(async (resolve, reject, signal) => {
      while (this.value === undefined && !this.closed) {
        this.setEvt.clear();
        await this.setEvt.wait().registerSignal(signal);
      }
      if (this.closed && this.value === undefined) {
        return reject(new ValueDestroyedError());
      }

      const value = this.value!;
      if (removeValue) {
        this.value = undefined;
      }
      resolve(value);

      if (this.closed) {
        return reject(new ValueDestroyedError());
      }
    });
  }
}
