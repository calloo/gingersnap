import { Stream } from "./index";
import { Future } from "../future";
import { Stack } from "../data-structures/array";
import { SimpleQueue } from "../data-structures/object";
import { AbortError } from "../errors";

export type Collector<T, K> = (stream: Stream<K>) => Future<T>;

export class Collectors {
  static read<K>(functor: (value: K) => void | Future<void>) {
    return (stream: Stream<K>): Future<void> => stream.forEach(functor);
  }

  static asList() {
    return <K>(stream: Stream<K>): Future<K[]> => {
      return Future.of(async (resolve, reject, signal) => {
        const collection: K[] = [];

        for await (const value of stream) {
          collection.push(value);
          if (signal.aborted) {
            reject(new AbortError());
            break;
          }
        }
        resolve(collection);
      });
    };
  }

  static asSet() {
    return <K>(stream: Stream<K>): Future<Set<K>> => {
      return Future.of(async (resolve, reject, signal) => {
        const collection: Set<K> = new Set();

        for await (const value of stream) {
          collection.add(value);
          if (signal.aborted) {
            reject(new AbortError());
            break;
          }
        }
        resolve(collection);
      });
    };
  }

  static joining(delimiter: string = "") {
    return <K>(stream: Stream<K>) => {
      return Future.of<string>(async (resolve, reject, signal) => {
        let data: string = "";
        let value: any;
        const iterator = stream[Symbol.asyncIterator]();
        value = await iterator.next();

        if (!value.done) {
          do {
            const nextValue = await iterator.next();

            if (!nextValue.done) {
              data += value.value + delimiter;
              value = nextValue;
            } else break;
          } while (!signal.aborted);
        }

        if (signal.aborted) {
          reject(new AbortError());
          return;
        }

        if (value.value !== undefined && value.value !== null) {
          data += value.value;
        }
        resolve(data);
      });
    };
  }

  static asStack(maxSize: number | undefined = undefined) {
    return <K>(stream: Stream<K>) => {
      return Future.of<Stack<K>>(async (resolve, reject, signal) => {
        const collection: Stack<K> = new Stack(maxSize);

        for await (const value of stream) {
          collection.push(value);

          if (collection.full) {
            break;
          } else if (signal.aborted) {
            reject(new AbortError());
            break;
          }
        }
        resolve(collection);
      });
    };
  }

  static asQueue() {
    return <K>(stream: Stream<K>) => {
      return Future.of<SimpleQueue<K>>(async (resolve, reject, signal) => {
        const collection: SimpleQueue<K> = new SimpleQueue();

        for await (const value of stream) {
          collection.enqueue(value);
          if (signal.aborted) {
            reject(new AbortError());
            break;
          }
        }
        resolve(collection);
      });
    };
  }

  static counting() {
    return <K>(stream: Stream<K>) => {
      return Future.of<number>(async (resolve, reject, signal) => {
        let total = 0;
        for await (const _ of stream) {
          total++;
          if (signal.aborted) {
            reject(new AbortError());
            break;
          }
        }
        resolve(total);
      });
    };
  }
}
