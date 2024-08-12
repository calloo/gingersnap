import { Tuple } from "./Tuple";

/**
 * An immutable tuple of 2 values
 */
export class Pair<T, V> implements Tuple<T, V> {
  constructor(private readonly _first: T, private readonly _second: V) {}

  get first() {
    return this._first;
  }

  get second() {
    return this._second;
  }

  get last() {
    return this.second;
  }

  get values() {
    return [this._first, this._second] as [T, V];
  }
}

/**
 * Creates an immutable tuple of 2 values
 */
export const pair = <T, V>(first: T, second: V) => new Pair(first, second);
