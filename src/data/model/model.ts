import * as R from "ramda";
import { NetworkError, NoSuchElement, ParsingError } from "../../errors";
import X2JS from "x2js";
import "reflect-metadata";
import { DataFormat, DataType } from "./types";
import Papa from "papaparse";
import { decode as msgUnpack, encode as msgPack } from "@msgpack/msgpack";
import { parse } from "../../utils/parser";

export type ModelConstructor<T extends Model> = (new () => T) & typeof Model;

/**
 * Properties for handling de/serialization process for each property on a model
 */
export interface IgnoreProps {
  /**
   * Should serialization be enabled
   */
  serialize?: boolean;

  /**
   * Should deserialization be enabled
   */
  deserialize?: boolean;
}

/** @ignore */
export interface FieldProps {
  ignore?: IgnoreProps;
  name: string;
  Type: any;
  KeyType?: any;
  ValueType?: any;
  isArray?: boolean;
  isMap?: boolean;
  readonly?: boolean;
  aliases?: string[];
  schema?: {
    dataType: DataType;
    options?: {
      values?: string[];
      length?: number;
      itemType?: string;
      recordClass?: any;
      optional?: boolean;
      useOptionalObj?: boolean;
    };
    aliases?: string[];
  };
  customTags?: {
    [string: string]: {
      properties: Object;
      __callback__?: (name: string, properties: Object, target: Model, fieldName: string) => void;
    };
  };
}

/** @ignore */
export interface ModelInternalProps {
  fields: Map<string, FieldProps>;
  parent?: string;
}

/** @ignore */
export const namespacedModelInternalProps = new Map<string, ModelInternalProps>();

/**
 * A container object which may or may not contain a non-null/non-undefined value
 */
export class Optional<T> {
  constructor(private readonly value: T | undefined) {}

  /**
   * Returns an Optional with the specified present non-null value.
   * @param value
   */
  static of<T>(value: T | undefined) {
    return new Optional(value);
  }

  /**
   * Returns an empty Optional instance.
   */
  static empty<T>() {
    return new Optional<T>(undefined);
  }

  /**
   * Return true if there is a value present, otherwise false.
   */
  isPresent() {
    return this.value !== undefined && this.value !== null;
  }

  /**
   * If a value is present in this Optional, returns the value, otherwise throws NoSuchElement.
   */
  get() {
    if (this.isPresent()) {
      return this.value as T;
    }

    throw new NoSuchElement();
  }
}

/**
 * A Data de/serializer class that manages and validates data as JavaScript Objects
 */
export class Model {
  /** @ignore */
  private static readonly __xmlParser__: X2JS = new X2JS();

  /**
   * Converts arraybuffer to a model
   * @param data arraybuffer
   * @param format data format
   * @param options configurations for deserializing the data
   * @returns new model or an array of models
   */
  public static fromBuffer<T extends Model>(
    this: ModelConstructor<T>,
    data: Uint8Array | Buffer,
    format: DataFormat = DataFormat.JSON,
    options?: { headers?: string[]; ignoreErrors?: boolean; array?: boolean; delimiter?: string; newline?: string }
  ): T | T[] {
    switch (format) {
      case DataFormat.MESSAGE_PACK: {
        const decoder = msgUnpack;
        const result = decoder(data);
        if (options?.array && !(result instanceof Array || Array.isArray(result)))
          throw new ParsingError([], "expected an array of models");
        if ((!options?.array && result instanceof Array) || Array.isArray(result))
          throw new ParsingError([], "expected only one model");

        if (result instanceof Array || Array.isArray(result)) return result.map((v: any) => this.fromJSON<T>(v));
        return this.fromJSON<T>(result as any);
      }
      case DataFormat.CSV: {
        const text = data instanceof Uint8Array ? new TextDecoder().decode(data.buffer) : (data as Buffer).toString();
        return this.fromString<T>(text, format, options);
      }
      case DataFormat.XML:
      case DataFormat.JSON:
        return this.fromString<T>(
          data instanceof Uint8Array ? new TextDecoder().decode(data) : (data as Buffer).toString(),
          format,
          options
        );
    }
  }

  /**
   * Downloads data from the given source and deserializes the data to one or more models
   * @param source URL source to fetch the data
   * @param format data format
   * @param options configurations for deserializing and/or retrieving the data
   * @returns one or more models
   */
  public static async fromURL<T extends Model>(
    this: ModelConstructor<T>,
    source: string,
    format: DataFormat = DataFormat.JSON,
    options?: {
      headers?: string[];
      ignoreErrors?: boolean;
      array?: boolean;
      delimiter?: string;
      newline?: string;
      requestHeaders?: any;
      mode?: any;
    }
  ): Promise<T | T[]> {
    const fetcher = fetch;
    const resp = await fetcher(source, {
      method: "GET",
      headers: options?.requestHeaders,
      mode: options?.mode,
    });
    if (!resp.ok) throw new NetworkError(resp.status);
    return await this.fromBlob<T>(await resp.blob(), format, options);
  }

  /**
   * Deserializes one or more models from a Blob
   * @param data blob data
   * @param format data format
   * @param options configurations for deserializing the data
   * @returns one or more models
   */
  public static async fromBlob<T extends Model>(
    this: ModelConstructor<T>,
    data: Blob,
    format: DataFormat = DataFormat.JSON,
    options?: { headers?: string[]; ignoreErrors?: boolean; array?: boolean; delimiter?: string; newline?: string }
  ): Promise<T | T[]> {
    return this.fromBuffer<T>(new Uint8Array(await data.arrayBuffer()), format);
  }

  /**
   * Deserializes one or more models from given string
   *
   * @remarks
   * If the data format is a binary one, the provided string should be a hexadecimal string.
   * @param data string data source
   * @param format data format
   * @param options
   */
  public static fromString<T extends Model>(
    this: ModelConstructor<T>,
    data: string,
    format: DataFormat = DataFormat.JSON,
    options?: { headers?: string[]; ignoreErrors?: boolean; array?: boolean; delimiter?: string; newline?: string }
  ): T | T[] {
    switch (format) {
      case DataFormat.JSON:
        try {
          data = JSON.parse(data);
        } catch (e: any) {
          throw new ParsingError(e?.message ?? String(e));
        }
        return this.fromJSON(data as any);
      case DataFormat.XML:
        return this.fromObject<T>(this.__xmlParser__.xml2js(data), format);
      case DataFormat.CSV: {
        let result: Papa.ParseResult<any>;
        let text = data;
        if (options?.headers) text = options.headers.join(options?.delimiter ?? ",") + (options.newline ?? "\n") + text;

        try {
          result = Papa.parse<T>(text, {
            header: true,
            skipEmptyLines: true,
          });
        } catch (e: any) {
          throw new ParsingError([], e?.message ?? String(e));
        }

        if (!options?.ignoreErrors && result.errors.length > 0) throw new ParsingError(result.errors);
        if (!options?.array && result.data.length > 0) throw new ParsingError([], "Too many records found");

        if (options?.array) return result.data.map((v) => this.fromObject(v));
        return this.fromObject<T>(result.data[0]);
      }
      default:
        return this.fromBuffer(new Uint8Array(data.match(/../g)?.map((h) => parseInt(h, 16)) ?? []), format, options);
    }
  }

  /**
   * Converts a JSON object to a model
   * @param data JSON Object
   * @returns new model
   */
  public static fromJSON<T extends Model>(this: ModelConstructor<T>, data: object): T {
    return this.fromObject<T>(data, DataFormat.JSON);
  }

  /**
   * Converts the current model to a JSON object
   */
  public object(removeMissingFields = false): { [string: string]: any } {
    const serialize = (value: any) => {
      if (value instanceof Model) {
        return value.object(removeMissingFields);
      } else if (value instanceof Array || Array.isArray(value)) {
        return value.map((v) => serialize(v));
      } else if (value instanceof Set) {
        return Array.from(value);
      } else if (value instanceof Map) {
        try {
          return Object.fromEntries(value.entries());
        } catch (e) {
          // failed to serialize map to object, which means it contains keys that are not serializable to object
          return value;
        }
      } else if (value instanceof Function) {
        return null;
      }
      return value;
    };

    return R.reduce(
      (acc, [key, fieldProps]) => {
        if (fieldProps.ignore?.serialize) return acc;

        const value: any = R.prop(key as any, this);
        const serializedValue = serialize(value);
        if (!removeMissingFields || (serializedValue !== null && serializedValue !== undefined)) {
          acc[fieldProps.name] = serializedValue;
        }
        return acc;
      },
      {},
      Array.from((Model.buildPropTree(Object.getPrototypeOf(this))?.fields ?? new Map<string, FieldProps>()).entries())
    );
  }

  /**
   * Converts the current model to a JSON string
   */
  public json(removeMissingFields = false): string {
    return JSON.stringify(this.object(removeMissingFields));
  }

  /**
   * Converts the current model to an arraybuffer
   */
  public buffer(removeMissingFields = false): ArrayBuffer {
    return new TextEncoder().encode(this.json(removeMissingFields));
  }

  /**
   * Converts the current model to a blob
   */
  public blob(removeMissingFields = false): Blob {
    return new Blob([this.buffer(removeMissingFields)]);
  }

  /**
   * Converts the current model to an XML string
   */
  public xml(removeMissingFields = false): string {
    return Model.__xmlParser__.js2xml(this.object(removeMissingFields));
  }

  /**
   * Converts the current model to message pack binary format
   * @returns message pack binary
   */
  public messagePack(removeMissingFields = false): Buffer {
    return msgPack(this.object(removeMissingFields)).buffer as Buffer;
  }

  /**
   * Converts the current model to csv format
   * @param removeMissingFields
   * @param config CSV unparsing configuration
   * @returns csv string
   */
  public csv(removeMissingFields = false, config?: Papa.UnparseConfig): string {
    return Papa.unparse([this.object(removeMissingFields)], config);
  }

  public clone() {
    const newModel = new (Object.getPrototypeOf(this))();
    for (const [key, value] of Object.entries(this)) {
      newModel[key] = !R.isNil(value) ? R.clone(value) : value;
    }

    return newModel;
  }

  /**
   * Retrieves the schema of the current model based on the selected format
   * @param format data format
   * @returns the schema for the current model
   */
  public schema(format: DataFormat = DataFormat.JSON) {
    return (Object.getPrototypeOf(this) as Model).schema(format);
  }

  toString() {
    return this.json(true);
  }

  /**
   * Constructs the model properties by traversing the inheritance tree of the current Model being instantiated
   * @param modelPrototype prototype of the model
   * @ignore
   */
  private static buildPropTree(modelPrototype: any): ModelInternalProps {
    let value: ModelInternalProps | undefined;
    let proto = !modelPrototype.name ? modelPrototype.constructor : modelPrototype;
    const tree: ModelInternalProps = { fields: new Map() };

    while (proto && proto?.name !== "Function") {
      let space = proto.name;
      tree.fields.clear();
      while (space && (value = namespacedModelInternalProps.get(space))) {
        value.fields.forEach((value, key) => tree.fields.set(key, value));
        space = value.parent ?? "";
      }

      // could be that subclass didn't use any annotators. check parent
      if (tree.fields.size === 0) {
        proto = Object.getPrototypeOf(proto);
      } else {
        break;
      }
    }
    return tree;
  }

  /**
   * Constructs a model from a JSON object
   * @param data JSON object
   * @param format
   * @private
   */
  private static fromObject<T extends Model>(data: Object, format: DataFormat = DataFormat.JSON): T {
    if (data instanceof Array || Array.isArray(data) || typeof data !== "object") {
      throw new ParsingError([], "Invalid data provided. Must be an object");
    }

    const processValue = (fieldProps: FieldProps, value: any) => {
      if (fieldProps.schema?.options?.useOptionalObj) {
        return Optional.of(value);
      }
      return value;
    };
    const model: any = new this();
    const props: ModelInternalProps = this.buildPropTree(Object.getPrototypeOf(model));

    R.forEach(([key, fieldProps]: [string, FieldProps]) => {
      let value = data[key];

      if (value === undefined || value === null) {
        for (const alias of fieldProps.aliases ?? []) {
          value = data[alias];
          if (value !== undefined) break;
        }
      }

      if ((value === undefined || value === null) && fieldProps.ignore?.deserialize) {
        if (fieldProps.schema?.options?.useOptionalObj) {
          model[key] = Optional.empty();
        }
        return;
      } else if ((value === undefined || value === null) && (model[key] === undefined || model[key] === null)) {
        throw new ParsingError([], `Property "${key}" is missing from the data provided. ${JSON.stringify(data)}`);
      } else if ((value === undefined || value === null) && !(model[key] === undefined || model[key] === null)) {
        return;
      }

      if (Object.getOwnPropertyDescriptor(Object.getPrototypeOf(model), key)?.set) {
        model[key] = processValue(fieldProps, value);
      } else if (Object.getOwnPropertyDescriptor(Object.getPrototypeOf(model), key)?.get) {
        return;
      } else if (
        model[key] instanceof fieldProps.Type &&
        typeof model[key] === "function" &&
        fieldProps.Type instanceof Function
      ) {
        model[key](value);
      } else if (fieldProps.isArray && fieldProps.Type.prototype instanceof Model) {
        const parser = parse({
          string: (v) => fieldProps.Type.fromString(v, format),
          object: (v) => fieldProps.Type.fromObject(v, format),
          default: () => {
            throw new ParsingError([], `value for ${key} is expected to be an Array, instead received ${typeof value}`);
          },
          supportArray: true,
        });
        model[key] = processValue(fieldProps, parser(value));
      } else if (fieldProps.Type.prototype instanceof Model) {
        const parser = parse({
          string: (v) => fieldProps.Type.fromString(v, format),
          object: (v) => fieldProps.Type.fromObject(v, format),
          default: () => {
            throw new ParsingError([], `value for ${key} expected to be serializable object`);
          },
        });
        const result = parser(value);

        if (result instanceof Array || Array.isArray(result)) {
          throw new ParsingError([], `value for ${key} expected to be serializable object, not an array`);
        }
        model[key] = processValue(fieldProps, result);
      } else if (fieldProps.isMap && fieldProps.ValueType.prototype instanceof Model) {
        const parser = parse({
          string: (v) => fieldProps.ValueType.fromString(v, format),
          object: (v) => fieldProps.ValueType.fromObject(v, format),
          default: () => {
            throw new ParsingError([], `value for ${key} expected to be serializable object`);
          },
        });

        try {
          const data = new Map(
            (!(value instanceof Array || Array.isArray(value)) && typeof value === "object"
              ? Object.entries(value)
              : value
            ).map(([k, v]) => [fieldProps.KeyType(k), v])
          );
          data.forEach((value, key) => {
            data.set(key, parser(value));
          });
          model[key] = processValue(fieldProps, data);
        } catch (e: any) {
          if (e instanceof ParsingError) throw e;
          throw new ParsingError([], e?.message ?? String(e));
        }
      } else if (fieldProps.isMap) {
        try {
          const data = new Map(
            (!(value instanceof Array || Array.isArray(value)) && typeof value === "object"
              ? Object.entries(value)
              : value
            ).map(([k, v]) => [fieldProps.KeyType(k), v])
          );
          model[key] = processValue(fieldProps, data);
          data.forEach((value, key) => {
            data.set(key, parse({ default: (v) => new fieldProps.Type(v) }, value));
          });
        } catch (e: any) {
          if (e instanceof ParsingError) throw e;
          throw new ParsingError([], e?.message ?? String(e));
        }
      } else if (fieldProps.isArray) {
        if (typeof value === "string") {
          try {
            value = JSON.parse(value);
          } catch (e: any) {
            throw new ParsingError([], e?.message ?? String(e));
          }
        }
        if (!(value instanceof Array || Array.isArray(value))) {
          throw new ParsingError([], `value for ${key} is expected to be an Array, instead received ${typeof value}`);
        }

        model[key] = processValue(
          fieldProps,
          value.map((v) => {
            switch (typeof v) {
              case "boolean":
              case "number":
              case "bigint":
              case "undefined":
              case "string":
                return v;
              default: {
                let val: any;
                try {
                  val = new fieldProps.Type(v);
                } catch (e: any) {
                  if (e instanceof ParsingError) {
                    throw e;
                  }
                  throw new ParsingError([], e?.message ?? String(e));
                }
                if (isNaN(val.getTime())) {
                  throw new ParsingError([], "Failed to convert to annotated  date type");
                }
                return val;
              }
            }
          })
        );
      } else if (fieldProps.Type?.name === "String") {
        model[key] = processValue(fieldProps, String(value));
      } else if (fieldProps.Type?.name === "Boolean") {
        model[key] = processValue(fieldProps, Boolean(value));
      } else if (fieldProps.Type?.name === "Number") {
        model[key] = processValue(fieldProps, Number(value));
      } else if (fieldProps.Type?.name === "Map") {
        const valueType = typeof value;
        switch (valueType) {
          case "object": {
            try {
              model[key] = processValue(
                fieldProps,
                value instanceof Array || Array.isArray(value) ? new Map(value) : new Map(Object.entries(value))
              );
            } catch (e: any) {
              throw new ParsingError([], e?.message ?? String(e));
            }
            break;
          }
          case "string":
            try {
              value = JSON.parse(value);
              model[key] = processValue(
                fieldProps,
                value instanceof Array || Array.isArray(value) ? new Map(value) : new Map(Object.entries(value))
              );
            } catch (e: any) {
              throw new ParsingError([], e?.message ?? String(e));
            }
            break;
          default:
            throw new ParsingError([value], `value for ${key} cannot be converted to a Map`);
        }
      } else if (fieldProps.Type?.name === "Set") {
        if (value instanceof Array || Array.isArray(value)) {
          model[key] = processValue(fieldProps, new Set(value));
        } else if (typeof value === "string") {
          model[key] = processValue(fieldProps, new Set(JSON.parse(value)));
        }
        throw new ParsingError([value], `value for ${key} cannot be converted to a Set`);
      } else {
        model[key] = processValue(fieldProps, new fieldProps.Type(value));
      }

      if (fieldProps.readonly) {
        Object.defineProperty(model, key, {
          value: model[key],
          writable: false,
          enumerable: true,
        });
      }

      R.forEach(([k, v]) => {
        if (v.__callback__) v.__callback__(k, v.properties, model, key);
      }, R.toPairs(fieldProps.customTags ?? {}));
    }, Array.from(props.fields.entries()));

    return Object.seal(model) as T;
  }
}
