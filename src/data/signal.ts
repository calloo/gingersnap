import { Stream } from "../stream";
import { Future, WaitPeriod } from "../future";
import { Queue } from "../data-structures/object";

export interface Token {
  cancel: () => void;
}

export class Signal<T> {
  private readonly subscribers: Set<(v: T) => void>;
  private readonly latestValue: T;
  private task?: Future<void>;
  private readonly source: Stream<T>;

  constructor(source: Stream<T> | Queue<T>) {
    this.subscribers = new Set();
    this.source = source instanceof Stream ? source : source.streamEntries;
  }

  start() {
    this.task = this.source.forEach((value) => {
      for (const subscriber of this.subscribers) {
        subscriber(value);
      }
    });
  }

  stop() {
    this.task?.cancel();
  }

  subscribe(callback: (value: T) => void): Token {
    this.subscribers.add(callback);
    if (this.latestValue !== undefined) {
      callback(this.latestValue);
    }

    return {
      cancel: () => {
        this.subscribers.delete(callback);
      },
    };
  }

  stream(objectMaxSize?: number, expiryPeriod?: WaitPeriod): Stream<T> {
    const queue = new Queue<T>(objectMaxSize, expiryPeriod);
    const token = this.subscribe((value) => {
      queue.enqueue(value);
    });
    return queue.streamEntries.onCancellation(token.cancel);
  }
}
