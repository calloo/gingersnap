import { Future, FutureResult, WaitPeriod } from "./future";
import { ContextManager } from "./managers";

/**
 * An event that is awaitable
 */
export class FutureEvent {
  private readonly __internal__: EventTarget;
  private ready: boolean;

  constructor() {
    this.__internal__ = new EventTarget();
    this.ready = false;
  }

  /**
   * Checks if the event happened
   */
  get isSet() {
    return this.ready;
  }

  /**
   * Waits for the event to occur
   * @param period
   */
  public wait(period?: WaitPeriod) {
    const future = Future.of<FutureEvent>((resolve, reject, signal) => {
      if (!this.isSet) {
        const readyCallback = () => resolve(this);
        signal.onabort = () => this.__internal__.removeEventListener("ready", readyCallback);
        this.__internal__.addEventListener("ready", readyCallback, { once: true });
      } else {
        resolve(this);
      }
    });

    if (period) return Future.waitFor(future, period);
    return future;
  }

  /**
   * Notifies all listeners that the event has been triggered
   */
  public set() {
    this.ready = true;
    this.__internal__.dispatchEvent(new Event("ready"));
  }

  /**
   * Resets the event signals, returns to a 'waiting for event' state
   */
  public clear() {
    this.ready = false;
  }
}

/**
 * A mutex lock for asynchronous operations
 */
export class Lock implements ContextManager<Lock> {
  private __locked__: boolean;
  private readonly evt: FutureEvent;

  constructor() {
    this.__locked__ = false;
    this.evt = new FutureEvent();
  }

  /**
   * Checks if the current lock has been acquired
   */
  get locked() {
    return this.__locked__;
  }

  /**
   * Acquire and release the lock irrespective of the provided function failing.
   * The function can also return data to the invoker of the with() context
   * @param functor
   */
  with<K>(functor: (value: FutureResult<Lock>) => K) {
    return this.acquire()
      .thenApply(functor)
      .finally(() => this.release());
  }

  /**
   * Attempts to acquire the lock
   * @param waitPeriod
   */
  public acquire(waitPeriod?: WaitPeriod): Future<Lock> {
    if (this.locked) {
      return this.evt.wait(waitPeriod).thenApply(() => {
        if (this.locked) return this.acquire(waitPeriod);
        this.evt.clear();
        this.__locked__ = true;
        return this;
      });
    }

    this.evt.clear();
    this.__locked__ = true;
    return Future.completed<Lock>(this);
  }

  /**
   * Releases the lock, allowing the next waiting call to acquire the lock
   */
  public release() {
    this.__locked__ = false;
    this.evt.set();
  }
}
