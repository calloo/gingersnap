import { WatchableObject } from "./WatchableObject";
import { FutureCancelled, QueueEmptyError } from "../../errors";
import { Future, WaitPeriod } from "../../future";
import { Stream } from "../../stream";
import { QueueFullError } from "../../errors/QueueFullError";
import { FutureEvent } from "../../synchronize";
import { ValueDestroyedError } from "../../errors/ValueDestroyedError";

/**
 * Queue data structure for First In First Out operation (FIFO)
 */
export class Queue<T> extends WatchableObject<number, T> implements Iterator<T> {
  private tail: number;
  private head: number;
  private closedSignal: AbortSignal;
  private closed: boolean;
  private readonly dequeueEvt: FutureEvent;

  constructor(objectMaxSize?: number, expiryPeriod?: WaitPeriod) {
    super(objectMaxSize, expiryPeriod);
    this.tail = 0;
    this.head = 0;
    this.closedSignal = new AbortController().signal;
    this.closed = false;
    this.dequeueEvt = new FutureEvent();
  }

  get streamEntries() {
    return Stream.of(this.asyncIterator);
  }

  close() {
    this.closed = true;
    this.closedSignal.dispatchEvent(new CustomEvent("abort"));
    this.closedSignal = AbortSignal.abort();
  }

  clone() {
    const obj: any = super.clone();
    obj.head = this.head;
    obj.tail = this.tail;
    return obj as Queue<T>;
  }

  ingest(stream: Stream<T>): Future<void> {
    return this.ingestStream(stream, (data) => this.enqueue(data));
  }

  enqueue(value: T) {
    if (this.objectMaxSize && this.size() >= this.objectMaxSize) {
      throw new QueueFullError();
    } else if (this.closed) {
      throw new ValueDestroyedError();
    }
    this.set(this.tail, value);
    this.tail++;
  }

  awaitEnqueue(value: T): Future<void> {
    return Future.of(async (resolve, reject, signal) => {
      while (this.objectMaxSize && this.size() >= this.objectMaxSize) {
        this.dequeueEvt.clear();
        await this.dequeueEvt.wait().registerSignal(signal).registerSignal(this.closedSignal);
      }
      this.set(this.tail, value);
      this.tail++;
      resolve();
    });
  }

  dequeue(): T {
    if (this.closed) {
      throw new ValueDestroyedError();
    }

    const value = this.get(this.head);
    if (value !== undefined && value !== null) {
      this.delete(this.head);
      this.head++;
      this.dequeueEvt.set();
      return value;
    }
    throw new QueueEmptyError();
  }

  awaitDequeue(abortSignal?: AbortSignal): Future<T> {
    if (this.empty && !this.closed) {
      return this.await(this.head, abortSignal)
        .registerSignal(this.closedSignal)
        .thenApply((v) => {
          this.delete(this.head);
          this.head++;
          this.dequeueEvt.set();
          return v.value;
        }) as Future<T>;
    }

    try {
      return Future.completed(this.dequeue());
    } catch (e: any) {
      return Future.exceptionally(e) as Future<T>;
    }
  }

  awaitEmpty() {
    return Future.of<void>(async (resolve, reject, signal) => {
      while (!this.closed && !this.empty) {
        this.dequeueEvt.clear();
        await this.dequeueEvt.wait();
      }
      if (this.closed) {
        return reject(new ValueDestroyedError());
      }
      resolve();
    });
  }

  get asyncIterator(): AsyncGenerator<T> {
    const self = this;
    const generator = {
      [Symbol.asyncIterator](): AsyncGenerator<T> {
        return generator;
      },
      return(value?: any): any {
        return value;
      },
      throw(e?: any): any {
        throw e;
      },
      async next(...args: [] | [unknown]): Promise<IteratorResult<T>> {
        try {
          return {
            done: false,
            value: await self.awaitDequeue(),
          };
        } catch (e) {
          if (e instanceof ValueDestroyedError) {
            throw new FutureCancelled();
          }
          throw e;
        }
      },
    };
    return generator;
  }

  clear() {
    if (this.closed) {
      throw new ValueDestroyedError();
    }
    super.clear();
    this.tail = 0;
    this.head = 0;
  }

  get empty() {
    return this.tail <= this.head;
  }

  size(): number {
    return this.tail - this.head;
  }

  peek() {
    if (this.closed) {
      throw new ValueDestroyedError();
    }
    return this.get(this.head);
  }

  next(...args: [] | [undefined]): IteratorResult<T, any> {
    if (!this.empty) {
      return {
        done: false,
        value: this.dequeue(),
      };
    }
    return {
      done: true,
      value: undefined,
    };
  }

  return?(value?: any): IteratorResult<T, any> {
    return this.next();
  }

  throw?(e?: any): IteratorResult<T, any> {
    throw e;
  }
}
