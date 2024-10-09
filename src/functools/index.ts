import * as R from "ramda";
import { Stream } from "../stream";
import { Future } from "../future";
import { Collectors } from "../stream/collector";
import { FutureCancelled } from "../errors";

/**
 * Returns true if all elements of the stream match the predicate, false if there are any that don't.
 */
export const all = <T>(predicate: (v: T) => boolean | Future<boolean>, stream: Stream<T>): Future<boolean> =>
  stream
    .map(predicate)
    .skipWhile(R.equals(true))
    .take(1)
    .collect(Collectors.counting())
    .thenApply(({ value }) => value === 0);

/**
 * Returns a new stream containing the contents of the given stream, followed by the given element.
 */
export const append = <T>(value: T | Future<T>, stream: Stream<T>): Stream<T> => {
  return Stream.of(async function* (signal: AbortSignal) {
    stream.cancelOnSignal(signal);

    for await (const data of stream) {
      yield data;
    }

    if (value instanceof Future) {
      yield await value;
    } else {
      yield value;
    }
  }) as Stream<T>;
};

/**
 * Returns a new stream with the given element at the front, followed by the contents of the stream.
 */
export const prepend = <T>(value: T | Future<T>, stream: Stream<T>): Stream<T> => {
  return Stream.of(async function* (signal: AbortSignal) {
    stream.cancelOnSignal(signal);
    if (value instanceof Future) {
      yield await value;
    } else {
      yield value;
    }

    for await (const data of stream) {
      yield data;
    }
  }) as Stream<T>;
};

/**
 * Returns the result of concatenating the given streams.
 */
export const concat = <T>(value: Stream<T>, stream: Stream<T>): Stream<T> => {
  return Stream.of(async function* (signal: AbortSignal) {
    value.cancelOnSignal(signal);
    stream.cancelOnSignal(signal);

    for await (const data of value) {
      yield data;
    }
    for await (const data of stream) {
      yield data;
    }
  }) as Stream<T>;
};

export const head = <T>(stream: Stream<T>): Future<T> => stream.head().execute();

export const tail = <T>(stream: Stream<T>): Future<T> => stream.tail().execute();

export const filter = <T>(predicate: (v: T) => boolean | Future<boolean>, stream: Stream<T>): Stream<T> =>
  stream.filter(predicate);

export const map = <T, V>(predicate: (v: T) => V | Future<V>, stream: Stream<T>) => stream.map(predicate);

export const insert = <T>(index: number, value: T | Future<T>, stream: Stream<T>) =>
  Stream.of(async function* (signal: AbortSignal) {
    stream.cancelOnSignal(signal);
    let i = -1;
    let inserted = false;

    for await (const data of stream) {
      if (!inserted) {
        i++;
      }

      if (i === index) {
        inserted = true;
        if (value instanceof Future) {
          yield await value;
        } else {
          yield value;
        }
      }
      yield data;
    }
  }) as Stream<T>;

export const insertAll = <T>(index: number, value: T[] | Array<Future<T>> | Stream<T>, stream: Stream<T>) =>
  Stream.of(async function* (signal: AbortSignal) {
    stream.cancelOnSignal(signal);
    let i = -1;
    let inserted = false;

    for await (const data of stream) {
      if (!inserted) {
        i++;
      }

      if (i === index) {
        inserted = true;
        if (value instanceof Stream) {
          value.cancelOnSignal(signal);
          for await (const data of value) {
            yield data;
          }
        } else {
          for (const data of value) {
            if (data instanceof Future) {
              yield await data;
            } else {
              yield data;
            }
          }
        }
      }
      yield data;
    }
  }) as Stream<T>;

export const slice = <T>(start: number, end: number, stream: Stream<T>) => stream.skip(start).take(end - start);

export const repeat = <T>(value: Future<T>, count: number) =>
  Stream.of(async function* (signal: AbortSignal) {
    const result = await value.registerSignal(signal);

    for (let i = 0; i < count; i++) {
      yield result;
    }
  }) as Stream<T>;

export const join = (separator: string, stream: Stream<string>) => {
  let result = "";
  return stream
    .forEach((value) => {
      result += value + separator;
    })
    .thenApply(() => {
      if (result !== "") {
        return result.substring(0, result.lastIndexOf(separator));
      }
      return result;
    });
};

export const without = <T>(value: T[] | Future<T[]>, stream: Stream<T>) =>
  value instanceof Future
    ? Stream.of(async function* (signal: AbortSignal) {
        const result = await value.registerSignal(signal);

        for await (const v of stream.filter((v) => !result.includes(v))) {
          yield v;
        }
      })
    : stream.filter((v) => !value.includes(v));

export const repeatUntilSuccess = <T>(
  retries: number,
  waitPeriodInSeconds: number,
  backoffFactor: number,
  functor: () => Future<T>
) =>
  Future.of<T>(async (_, __, signal) => {
    let lastError: unknown;
    let i = 0;
    let waitPeriod = waitPeriodInSeconds;

    while (i < retries && !signal.aborted) {
      try {
        return await functor().registerSignal(signal);
      } catch (e: unknown) {
        lastError = e;
        i++;
        await Future.sleep({ seconds: waitPeriod });
        waitPeriod *= backoffFactor;
      }
    }

    throw lastError || new FutureCancelled();
  });

export const range = (start: number, stop: number | undefined = undefined, step = 1) =>
  Stream.of(async function* (signal: AbortSignal) {
    const begin = stop === undefined ? 0 : start;
    const end = stop ?? start;

    for (let i = begin; i < end; i += step) {
      if (signal.aborted) break;
      yield i;
    }
  });

export const nth = <T>(index: number, stream: Stream<T>) => stream.skip(index).future;
