/**
 * An immutable collection of items
 */
export interface Tuple<T, V> {
  get first(): T;
  get last(): V;
  get values(): any[];
}
