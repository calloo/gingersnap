import FutureCancelled from "../../errors/FutureCancelled";
import FutureError from "../../errors/FutureError";
import TimeoutError from "../../errors/TimeoutError";
import InvalidValue from "../../errors/InvalidValue";
import * as R from "ramda";
import { SimpleQueue } from "../../data-structures/object/SimpleQueue";
import { v4 as uuid } from "uuid";
import { FutureResult, InferredFutureResult } from "./result";
import { Stream } from "../stream";

type Resolve<T> = (value: T | PromiseLike<T>) => any;
type Reject = (reason?: Error) => void;
type Executor<T> = (resolve: Resolve<T>, reject: Reject, signal: AbortSignal) => void | Promise<void>;
type FutureReturnType<T> = T extends Future<infer U> ? U : T;

/**
 * Duration to wait for something to occur
 */
export interface WaitPeriod {
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
  hours?: number;
}

/**
 * Represents an eventual result of some asynchronous operation. Futures are quite similar to Promise, and can be
 * awaited as they are **Thenable** objects
 */
export class Future<T> {
  private guid: string;

  private signals: Set<AbortSignal>;

  private signalRegisteredCallback?: (v: AbortSignal) => void;

  private defaultSignal: AbortSignal;

  private fulfilled: boolean;

  private isRunning: boolean;

  private readonly executor: Executor<T>;

  private completedResult?: T;

  private failureResult?: Error;

  private underLyingPromise?: Promise<T>;

  private processors: SimpleQueue<{ success?: (v: FutureResult<T>) => any; failure?: (v: Error) => any }>;

  private readonly finallyHandlers: SimpleQueue<(v: Future<T>) => void>;

  constructor(executor: Executor<T>, signal?: AbortSignal) {
    this.guid = uuid();
    this.executor = executor;
    this.defaultSignal = signal ?? new AbortController().signal;
    this.signals = new Set<AbortSignal>([this.defaultSignal]);
    this.fulfilled = false;
    this.isRunning = false;
    this.processors = new SimpleQueue();
    this.finallyHandlers = new SimpleQueue();
  }

  /**
   * Creates a future from the value provided
   * @param value an Executor function (callback for the new Future constructor)
   * @param signal Abort Signal to establish the future with. If not provided, the future will only have the default
   * signals
   */
  public static of<K>(value: Executor<K>, signal?: AbortSignal) {
    return new Future(value, signal);
  }

  /**
   * Wraps a promise as a future
   * @param value
   */
  public static wrap<K>(value: Promise<K>): Future<InferredFutureResult<K>> {
    return new Future<InferredFutureResult<K>>((resolve, reject) => {
      value.then(resolve as any).catch(reject);
    });
  }

  /**
   * Waits for the given future to complete. If not completed within the given timeframe, the given future is cancelled
   * @param value
   * @param timeout wait period object or the number of milliseconds to wait
   */
  public static waitFor<K>(value: Future<K>, timeout: WaitPeriod | number) {
    const timeableFuture = Future.sleep(timeout)
      .registerSignal(value.defaultSignal)
      .catch(() => {});

    return Future.of<K>(
      (resolve, reject) =>
        Promise.race([timeableFuture, value.run()])
          .then((v) => {
            if (value.done) {
              timeableFuture.cancel();
              resolve(v as any);
              return;
            }
            value.cancel();
            reject(new TimeoutError());
          })
          .catch((error) => {
            if (!timeableFuture.failed) {
              timeableFuture.cancel();
            }
            reject(error);
          }),
      value.defaultSignal
    );
  }

  /**
   * Sleeps for the given period. If period is a number, then it's the sleep duration in seconds
   * @param period
   * @param signal
   */
  public static sleep(period: WaitPeriod | number, signal?: AbortSignal) {
    return new Future<void>((resolve, reject, futureSignal) => {
      const totalTime =
        typeof period === "number"
          ? period * 1000
          : (period.hours ?? 0) * 60 * 60 * 1000 +
            (period.minutes ?? 0) * 60 * 1000 +
            (period.seconds ?? 0) * 1000 +
            (period.milliseconds ?? 0);
      const timer = setTimeout(resolve, totalTime);
      futureSignal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new FutureCancelled());
        },
        { once: true }
      );
    }, signal);
  }

  /**
   * Returns a future that completes with the given value.
   * Important Note:
   * Passing a Future or Stream to this function will execute it once and yield the result.
   * @param value
   */
  public static completed<T>(value: T) {
    return new Future<T>((resolve) => resolve(value));
  }

  /**
   * Returns a future that fails with the given value
   * @param value
   */
  public static exceptionally(value: Error) {
    return new Future((_, reject) => reject(value));
  }

  /**
   * Returns the first completed or failed. If this is cancelled, then all futures provided will also be cancelled
   * @param futures list of futures
   * @param signal optinal abort signal
   */
  public static firstCompleted<T extends Array<Future<any>>>(
    futures: T,
    signal?: AbortSignal
  ): Future<FutureReturnType<T[number]>> {
    return Future.of((resolve, reject, signal) => {
      futures.forEach((future) => {
        future.registerSignal(signal);
      });
      Promise.race(futures)
        .then(resolve)
        .catch(reject)
        .finally(() => {
          futures.forEach((future) => {
            future.unregisterSignal(signal);
          });
        });
    }, signal);
  }

  /**
   * Awaits all futures completion, and collects the results in an array. If this future is cancelled, then all provided
   * futures will also be cancelled.
   * @param futures list of futures
   * @param signal optional abort signal
   */
  public static collect<T extends Future<any>>(futures: T[], signal?: AbortSignal): Future<Array<FutureReturnType<T>>> {
    return Future.of((resolve, reject, signal) => {
      futures.forEach((future) => {
        future.registerSignal(signal);
      });
      Promise.all(futures.map((f) => f.run()))
        .then(resolve)
        .catch(reject)
        .finally(() => {
          futures.forEach((future) => {
            future.unregisterSignal(signal);
          });
        });
    }, signal);
  }

  /**
   * Awaits futures finishing all possible executions, and returns the same list of futures. Whether each future
   * completed or failed, the future is returned in the array
   * @param futures
   */
  public static collectSettled<T extends Future<any>>(futures: T[]): Future<T[]> {
    return Future.of((resolve, reject, signal) => {
      futures.forEach((future) => {
        future.registerSignal(signal);
      });
      Promise.allSettled(futures.map((f) => f.run()))
        .then(() => resolve(futures))
        .catch(reject)
        .finally(() => {
          futures.forEach((future) => {
            future.unregisterSignal(signal);
          });
        });
    });
  }

  /**
   * Unique ID of the future
   */
  get id() {
    return this.guid;
  }

  /**
   * Changes the future ID
   * @param value
   */
  set id(value: string) {
    this.guid = value;
  }

  /**
   * Checks if the future completed. A completed future is one that ran successfully without termination.
   */
  get done() {
    return this.fulfilled;
  }

  /**
   * Checks if the future failed
   */
  get failed() {
    return this.error instanceof Error;
  }

  /**
   * Retrieves the result of the future, if there is any
   */
  get result() {
    return this.completedResult;
  }

  /**
   * Checks if the future is running
   */
  get running() {
    return this.isRunning;
  }

  /**
   * Retrieves the error if any occurred
   */
  get error() {
    return this.failureResult;
  }

  /**
   * Convert the future to a stream
   */
  get stream(): Stream<T> {
    return Stream.of(this);
  }

  /**
   * Registers additional signal to the current future
   * @param signal
   */
  public registerSignal(signal: AbortSignal): Future<T> {
    if (!this.done && !this.failed) {
      this.signals.add(signal);
      if (this.signalRegisteredCallback) {
        this.signalRegisteredCallback(signal);
      }
    }
    return this;
  }

  /**
   * Removes the given signal from the future
   * @param signal
   */
  public unregisterSignal(signal: AbortSignal): Future<T> {
    if (signal === this.defaultSignal) {
      throw new InvalidValue("Cannot deregister default signal");
    }
    this.signals.delete(signal);
    return this;
  }

  /**
   * Runs the future in the background
   */
  public schedule() {
    this.run().catch(() => {});
    return this;
  }

  /**
   * Launches the future
   */
  public run() {
    return this.__run__();
  }

  /**
   * Cancels the future if it is currently running
   */
  public cancel() {
    if (this.running) {
      this.cancelWithSignal(this.defaultSignal);
    }
  }

  /**
   * Used to chain additional steps to be executed. This creates a new future
   * @param callback
   * @param clone whether the future should be cloned or not.Defaults to true
   */
  thenApply<K>(callback: (value: FutureResult<T>) => K, clone = false): Future<InferredFutureResult<K>> {
    const newFuture = (clone ? this.clone() : this) as Future<InferredFutureResult<K>>;
    newFuture.processors.enqueue({ success: callback as any });
    return newFuture;
  }

  /**
   * Used to run callback irrespective of the future completing or failing
   * @param callback
   * @param clone whether the future should be cloned or not.Defaults to true
   */
  finally(callback: (value: Future<T>) => void, clone = false): Future<T> {
    const newFuture = clone ? this.clone() : this;
    newFuture.finallyHandlers.enqueue(callback);
    return newFuture;
  }

  /**
   * Handles any error that occurs in the previous steps inside the future
   * @param callback
   * @param clone whether the future should be cloned or not.Defaults to true
   */
  catch<K>(callback: (reason: Error) => K, clone = false): Future<InferredFutureResult<T | K>> {
    const newFuture = (clone ? this.clone() : this) as Future<InferredFutureResult<K>>;
    newFuture.processors.enqueue({ failure: callback });
    return newFuture as unknown as Future<InferredFutureResult<T | K>>;
  }

  /**
   * Clones the current future
   */
  public clone(): Future<T> {
    const future = new Future(this.executor, this.defaultSignal);
    future.signals = new Set(this.signals);
    future.defaultSignal = this.defaultSignal;
    future.processors = this.processors.clone();
    future.fulfilled = this.fulfilled;
    return future;
  }

  /**
   * Internal. Only to be called by the internal JS runtime during await
   * @private
   */
  then(onFulfilled: (v: T) => void, onRejected: (reason: unknown) => void) {
    return this.__run__(onFulfilled, onRejected);
  }

  /**
   * Executes the future. Should only be triggered by the JS runtime via then(), or the user via run()
   * @param onFulfilled
   * @param onRejected
   * @private
   */
  private __run__(onFulfilled?: (v: T) => void, onRejected?: (reason: unknown) => void): Promise<T> {
    if (this.underLyingPromise) {
      return this.underLyingPromise
        .then((v) => {
          onFulfilled?.(v);
          return v;
        })
        .catch((error) => {
          if (!(error instanceof Error)) {
            error = new FutureError(error);
          }
          onRejected?.(error);
          throw error;
        });
    }

    this.isRunning = true;
    const resolvePromise: (v: Promise<T>) => Promise<any> = (promise: Promise<T>) => {
      return promise
        .then(async (result) => {
          while (!this.processors.empty) {
            const { success } = this.processors.dequeue()!;
            if (!success) continue;

            try {
              result = await this.postResultProcessing(success(new FutureResult(result, this.defaultSignal)));
            } catch (error: unknown) {
              const handler = this.findFailureHandler();
              if (!handler) {
                throw error;
              }
              result = await this.postResultProcessing(
                handler(error instanceof Error ? error : new Error(String(error)))
              );
            }
          }
          return result;
        })
        .then((v) => {
          onFulfilled?.(v);
          return v;
        })
        .catch(async (error) => {
          const handler = this.findFailureHandler();
          if (!handler) {
            if (!(error instanceof Error)) {
              error = new FutureError(error);
            }
            onRejected?.(error);
            throw error;
          }

          try {
            const result = await this.postResultProcessing(handler(error));
            return await resolvePromise(Promise.resolve(result));
          } catch (e) {
            onRejected?.(e);
            throw e;
          }
        });
    };
    this.underLyingPromise = resolvePromise(
      new Promise<T>((resolve, reject) => {
        if (Array.from(this.signals).some((v) => v.aborted)) {
          reject(new FutureCancelled());
          return;
        }

        let rejected = false;
        const timeouts: any[] = [];
        const abort = R.once(() => this.cancelWithSignal(this.defaultSignal));
        const resolver = (v: any) => {
          if (v instanceof Promise) {
            v.then((v) => {
              this.fulfilled = true;
              resolve(v);
            }).catch(reject);
          } else if (v instanceof Future) {
            v.run()
              .then((v) => {
                this.fulfilled = true;
                resolve(v);
              })
              .catch(reject);
          } else if (v instanceof FutureResult) {
            this.fulfilled = true;
            resolve(v.value);
          } else {
            this.fulfilled = true;
            resolve(v);
          }
        };
        const rejecter = (reason: unknown) => {
          rejected = true;
          timeouts.forEach((v) => clearTimeout(v));
          reject(reason);
        };

        this.signalRegisteredCallback = (v) =>
          v.addEventListener(
            "abort",
            () => {
              abort();
              if (!rejected) timeouts.push(setTimeout(() => reject(new FutureCancelled()), 1000));
            },
            { once: true }
          );
        this.signals.forEach((v) => {
          v.addEventListener(
            "abort",
            () => {
              abort();
              if (!rejected) {
                timeouts.push(setTimeout(() => reject(new FutureCancelled()), 1000))
              };
            },
            { once: true }
          );
        });

        const result = this.executor(resolver, rejecter, this.defaultSignal);
        if (result instanceof Promise) {
          result.then(() => {
            if (!this.fulfilled) {
              this.fulfilled = true;
              resolve(null as any);
            }
          }).catch(rejecter);
        }
      })
    )
      .then((v) => {
        this.completedResult = v;
        return v;
      })
      .catch((e) => {
        this.failureResult = e instanceof Error ? e : new Error(String(e));
        throw this.failureResult;
      })
      .finally(() => {
        this.finallyHandlers.forEach((handler) => handler(this));
      })
      .catch((e) => {
        this.failureResult = e instanceof Error ? e : new Error(String(e));
        throw this.failureResult;
      })
      .finally(() => {
        this.signals = new Set();
        this.isRunning = false;
      });

    return this.underLyingPromise;
  }

  /**
   * Fires the abort signal
   * @param signal
   * @private
   */
  private cancelWithSignal(signal: AbortSignal) {
    if (!signal.aborted) {
      signal.dispatchEvent(new CustomEvent("abort"));
    }
  }

  /**
   * Checks if any handler exist to process errors
   * @private
   */
  private findFailureHandler() {
    while (!this.processors.empty) {
      const { failure } = this.processors.dequeue()!;
      if (failure) return failure;
    }
  }

  /**
   * Nested processing of a future result
   * @param result
   * @private
   */
  private async postResultProcessing(result: any) {
    if (result instanceof FutureResult) {
      result = result.value;
    } else if (result instanceof Future) {
      result = await result.registerSignal(this.defaultSignal).run();
    } else if (result instanceof Promise) {
      result = await result;
    } else if (result instanceof Stream) {
      result = await result.execute();
    }

    return result;
  }
}
