import * as R from "ramda";
import { Stream } from "../../stream";

/**
 * Object that is cyclical - has can store M keys, after which new key value pairs added override
 * previous entries.
 */
export class CyclicalObject<T, K> {
  /**
   * Underlying javascript data structure
   * @private
   */
  private target: K[];

  private readonly keyMapping: Map<T, number>;

  /**
   * Pointer to the current index
   * @private
   */
  private pointer: number;

  /**
   * Maximum size of this object
   * @private
   */
  protected readonly objectMaxSize?: number;
  private readonly emptySlots: number[];

  public constructor(objectMaxSize?: number) {
    this.target = [];
    this.keyMapping = new Map();
    this.pointer = -1;
    this.objectMaxSize = objectMaxSize;
    this.emptySlots = [];
  }

  public static from<T, K>(data: Map<T, K> | Array<[T, K]> | { T: K }) {
    const obj = new this<T, K>();
    if (data instanceof Map) {
      for (const [k, v] of data.entries()) {
        obj.set(k, v);
      }
    } else if (data instanceof Array || Array.isArray(data)) {
      for (const [k, v] of data) {
        obj.set(k, v);
      }
    } else {
      for (const [k, v] of Object.entries(data)) {
        obj.set(k as T, v);
      }
    }

    return obj;
  }

  get stream() {
    return Stream.of(this.target[Symbol.iterator]());
  }

  /**
   * Retrieves the value associated with the given key. If not exist, the default response will be returned
   * @param key
   * @param defaultValue
   */
  get(key: T, defaultValue: K | undefined = undefined) {
    const index = this.keyMapping.get(key);
    return !R.isNil(index) ? this.target[index] : defaultValue;
  }

  /**
   * Add the given key value pair to the object. This will overwrite any existing entry that has the same key
   * @param key
   * @param value
   */
  set(key: T, value: K) {
    if (this.objectMaxSize) {
      const index = this.keyMapping.get(key);
      if (!R.isNil(index)) {
        this.target[index] = value;
        return;
      } else if (this.emptySlots.length) {
        const index = this.emptySlots.pop();
        this.target[index!] = value;
        return;
      }

      this.pointer = this.objectMaxSize ? (this.pointer + 1) % this.objectMaxSize : this.pointer + 1;
      this.target[this.pointer] = value;
      this.keyMapping.set(key, this.pointer);
      return;
    }
    this.target.push(value);
    this.keyMapping.set(key, this.target.length - 1);
  }

  /**
   * Removes the value associated with the given key if it exists
   * @param key
   */
  delete(key: T) {
    const index = this.keyMapping.get(key);
    if (!R.isNil(index)) {
      this.emptySlots.push(index);
      this.target[index] = undefined as any;
    }
  }

  /**
   * Checks if the object has the given key
   * @param key
   */
  has(key: T) {
    return this.keyMapping.has(key);
  }

  /**
   * Iterates over each entry in the object by executing the provided callback on each entry
   * @param callback
   */
  forEach(callback: (value: K, key: T) => void) {
    Array.from(this.keyMapping.entries()).forEach(([key, index]) => callback(this.target[index], key));
  }

  /**
   * Wipes all key value pairs
   */
  clear() {
    this.pointer = -1;
    this.target = this.objectMaxSize ? new Array(this.objectMaxSize) : [];
    this.keyMapping.clear();
  }

  /**
   * Retrieves all the values from this object
   * @param copy Used to create a copied view of the values
   */
  values(copy?: boolean) {
    return copy ? R.clone(this.target.filter((v) => v !== undefined)) : this.target.filter((v) => v !== undefined);
  }

  /**
   * Retrieves the keys that are stored in this object
   */
  keys() {
    return this.keyMapping.keys();
  }

  /**
   * Retrieves the object size
   */
  size() {
    return this.pointer > -1 ? this.pointer + 1 : this.keyMapping.size;
  }

  clone() {
    const obj: any = new (Object.getPrototypeOf(this).constructor)();
    obj.target = R.clone(this.target);
    obj.pointer = this.pointer;
    obj.objectMaxSize = this.objectMaxSize;
    obj.keyMapping = R.clone(this.keyMapping);
    return obj as CyclicalObject<T, K>;
  }
}
