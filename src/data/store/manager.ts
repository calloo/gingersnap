import { WatchableObject } from "../../data-structures/object";
import { Future, WaitPeriod } from "../../future";
import { pair, Pair } from "../../data-structures/array";
import { Stream } from "../../stream";
import { calculatePeriodValue } from "../../future/future";
import { DataFormat, Field, Model } from "../model";

export interface PersistenceStore {
  open: () => Future<void>;
  close: () => Future<void>;
  get: (key: string) => Future<string | undefined>;
  set: (key: string, value: string) => Future<void>;
  remove: (key: string) => Future<void>;
  keys: () => Stream<string>;
  values: () => Stream<string>;
  length: () => Future<number>;
  clear: () => Future<void>;
}

class PersistedCachedRecord<T> extends Model {
  value: T;
  @Field("lastModifiedOn") lastModifiedOn: number;

  @Field("value")
  private setValue(v: any) {
    this.value = v;
  }
}

export class Cache<T, K> implements AsyncIterable<Pair<T, K>> {
  constructor(
    private readonly decode: (v: string) => K,
    private readonly encode: (v: K) => string | Future<string> | Promise<string>,
    private readonly persistStore?: PersistenceStore,
    maxSize?: number,
    private readonly expiryPeriod?: WaitPeriod
  ) {
    this.memStore = new WatchableObject<T, K>(maxSize, expiryPeriod);

    if (persistStore) {
      this.memStore.onDelete((k) => {
        persistStore.remove(this.getTransformedKey(k)).schedule();
      });

      this.memStore.onSet(async (k, v) => {
        const record = new PersistedCachedRecord();
        const result = this.encode(v);

        if (result instanceof Promise || result instanceof Future) {
          record.value = await result;
        } else {
          record.value = result;
        }
        record.lastModifiedOn = Date.now();
        persistStore.set(this.getTransformedKey(k), record.json()).schedule();
      });

      this.memStore.onClear(() => {
        persistStore.clear().schedule();
      });
    }
  }

  private readonly memStore: WatchableObject<T, K>;

  get(key: T): Future<K | undefined> {
    return Future.of((resolve, reject, signal) => {
      const value = this.memStore.get(key);

      if (value === undefined && this.persistStore) {
        const transformedKey = this.getTransformedKey(key);

        resolve(
          this.persistStore
            .get(transformedKey)
            .thenApply(({ value }) => {
              if (value) {
                const val = PersistedCachedRecord.fromString(value, DataFormat.JSON) as PersistedCachedRecord<K>;
                val.value = this.decode(val.value as any);
                return val;
              }
            })
            .thenApply(async ({ value, signal }) => {
              if (value) {
                if (this.expiryPeriod) {
                  const remainingTime = Date.now() - value.lastModifiedOn - calculatePeriodValue(this.expiryPeriod);
                  if (remainingTime <= 0) {
                    await this.persistStore.remove(transformedKey).registerSignal(signal);
                    return;
                  }
                  this.memStore.set(key, value.value, { milliseconds: remainingTime });
                } else {
                  this.memStore.set(key, value.value);
                }
              }

              return value?.value;
            })
            .registerSignal(signal) as Future<K | undefined>
        );
      }

      resolve(value);
    });
  }

  getSync(key: T) {
    return this.memStore.get(key);
  }

  set(key: T, value: K) {
    this.memStore.set(key, value);
  }

  remove(key: T) {
    this.memStore.delete(key);
  }

  keys(): Stream<T> {
    return (
      (this.persistStore?.keys().map(this.getInversedKey) as Stream<T> | undefined) ?? Stream.of(this.memStore.keys())
    );
  }

  keysSync() {
    return this.memStore.keys();
  }

  values(): Stream<K> {
    return (
      (this.persistStore
        ?.values()
        .map((v) => PersistedCachedRecord.fromString(v, DataFormat.JSON) as PersistedCachedRecord<K>)
        .map((v) => v.value) as Stream<K> | undefined) ?? Stream.of(this.valuesSync())
    );
  }

  valuesSync() {
    return this.memStore.values(true);
  }

  clear() {
    this.memStore.clear();
  }

  [Symbol.asyncIterator]() {
    const stream = this.keys()
      .map((k) => this.get(k).thenApply(({ value }) => pair(k, value)))
      .filter((v) => v.second !== undefined);
    return stream[Symbol.asyncIterator]();
  }

  private getTransformedKey(key: T) {
    let transformedKey: string;
    switch (typeof key) {
      case "string":
        transformedKey = "<string>" + key;
        break;
      case "number":
        transformedKey = `<number>${key}`;
        break;
      case "boolean":
        transformedKey = `<boolean>${key}`;
        break;
      case "object":
        if (key instanceof Date) {
          transformedKey = "<iso>" + key.toISOString();
          break;
        } else if (Array.isArray(key)) {
          transformedKey = "<json>" + JSON.stringify(key);
          break;
        }
      default:
        throw new Error("invalid key");
    }

    return transformedKey;
  }

  private getInversedKey(transformedKey: string) {
    let key: T;
    const rawKey = transformedKey.substring(8);

    switch (transformedKey.substring(0, 8)) {
      case "<string>":
        key = rawKey as T;
        break;
      case "<number>":
        key = Number(rawKey) as T;
        break;
      case "<bool  >":
        key = (rawKey === "true") as T;
        break;
      case "<date  >":
        key = new Date(rawKey) as T;
        break;
      case "<json  >":
        key = JSON.parse(rawKey) as T;
        break;
      default:
        throw new Error("invalid key");
    }

    return key;
  }
}

export class CacheManager {
  private readonly memStores: Map<string, Cache<any, any>>;

  constructor(
    private readonly persistStore?: PersistenceStore,
    private readonly maxSize?: number,
    private readonly expiryPeriod?: WaitPeriod
  ) {
    this.memStores = new Map<string, Cache<any, any>>();
  }

  createCache<T, K>(
    name: string,
    persist: boolean,
    encoder?: (v: K) => string | Future<string> | Promise<string>,
    decoder?: (v: string) => K,
    maxSize?: number,
    expiryPeriod?: WaitPeriod
  ) {
    if (persist && (!encoder || !decoder)) {
      throw new Error("encoder and decoder required for persisting data");
    }

    if (persist && !this.persistStore) {
      throw new Error("store required for persisting data");
    }

    const cache = new Cache<T, K>(
      decoder,
      encoder,
      persist ? this.persistStore : undefined,
      maxSize ?? this.maxSize,
      expiryPeriod ?? this.expiryPeriod
    );
    this.memStores.set(name, cache);
    return cache;
  }

  getCache<T, K>(name: string): Cache<T, K> {
    return this.memStores.get(name) as Cache<T, K>;
  }

  removeCache(name: string) {
    const cache = this.memStores.get(name);
    this.memStores.delete(name);
    cache?.clear();
  }
}
