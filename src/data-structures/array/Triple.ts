import { Tuple } from "./Tuple";

/**
 * An immutable tuple of 3 values
 */
export class Triple<T, V, K> implements Tuple<T, K> {
  constructor(private readonly _first: T, private readonly _second: V, private readonly _third: K) {}

  get first() {
    return this._first;
  }

  get second() {
    return this._second;
  }

  get third() {
    return this._third;
  }

  get last() {
    return this.third;
  }

  get values() {
    return [this._first, this._second, this._third] as [T, V, K];
  }
}

/**
 * Creates an immutable tuple of 3 values
 */
export const triple = <T, V, K>(first: T, second: V, third: K) => new Triple(first, second, third);
