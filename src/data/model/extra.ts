import { Model } from "./model";
import { IllegalArgumentsError, ParsingError } from "../../errors";
import * as R from "ramda";

type UnionParserOptions = "json" | "string" | "blob" | "buffer";
export const View =
  (modelClass: typeof Model, path: Array<string | number>, option: UnionParserOptions) =>
  (data: any, ...otherArgs: any[]) => {
    switch (option) {
      case "json": {
        const result = modelClass.fromJSON(data);
        return R.view(R.lensPath(path), result);
      }
      case "string": {
        const result = modelClass.fromString(data, ...otherArgs);
        return R.view(R.lensPath(path), result);
      }
      case "blob": {
        const result = modelClass.fromBlob(data, ...otherArgs);
        return R.view(R.lensPath(path), result);
      }
      case "buffer": {
        const result = modelClass.fromBuffer(data, ...otherArgs);
        return R.view(R.lensPath(path), result);
      }
      default:
        throw new IllegalArgumentsError([option]);
    }
  };

export const Union =
  (modelClasses: Array<typeof Model>, option: UnionParserOptions) =>
  (data: any, ...otherArgs: any[]) => {
    switch (option) {
      case "json":
        for (const ModelClass of modelClasses) {
          try {
            return ModelClass.fromJSON(data);
          } catch (err) {}
        }
        throw new ParsingError([], "Cannot find suitable model");
      case "string":
        for (const ModelClass of modelClasses) {
          try {
            return ModelClass.fromString(data, ...otherArgs);
          } catch (err) {}
        }
        throw new ParsingError([], "Cannot find suitable model");
      case "blob":
        for (const ModelClass of modelClasses) {
          try {
            return ModelClass.fromBlob(data, ...otherArgs);
          } catch (err) {}
        }
        throw new ParsingError([], "Cannot find suitable model");
      case "buffer":
        for (const ModelClass of modelClasses) {
          try {
            return ModelClass.fromBuffer(data, ...otherArgs);
          } catch (err) {}
        }
        throw new ParsingError([], "Cannot find suitable model");
      default:
        throw new IllegalArgumentsError([option]);
    }
  };
