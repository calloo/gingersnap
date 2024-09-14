import * as R from "ramda";
import { createProps } from "./options";
import { RequestType } from "../types";
import { WaitPeriod } from "../../future";

/// //// Helpers ///////
const createRequestDecorator = (type: RequestType) => (path: string) => (target: any, propertyKey: string) => {
  const proto = createProps(target.constructor);
  const typeLens = R.lensPath(["methodConfig", propertyKey, "requestType"]);
  const pathLens = R.lensPath(["methodConfig", propertyKey, "apiPath"]);
  proto.__internal__ = R.set(typeLens, type, proto.__internal__);
  proto.__internal__ = R.set(pathLens, path, proto.__internal__);
};

export enum CachingMethod {
  FALLBACK_ON_MISSING = "FALLBACK_ON_MISSING",
  HIT_FIRST = "HIT_FIRST",
}

/**
 * Marks method as a GET request
 */
export const GET = createRequestDecorator(RequestType.GET);

/**
 * Marks method as a PUT request
 */
export const PUT = createRequestDecorator(RequestType.PUT);

/**
 * Marks method as a POST request
 */
export const POST = createRequestDecorator(RequestType.POST);

/**
 * Marks method as a DELETE request
 */
export const DELETE = createRequestDecorator(RequestType.DELETE);

/**
 * Marks method as a PATCH request
 */
export const PATCH = createRequestDecorator(RequestType.PATCH);

/**
 * Marks method as a OPTIONS request
 */
export const OPTIONS = createRequestDecorator(RequestType.OPTIONS);

/**
 * Marks method as a HEAD request
 */
export const HEAD = createRequestDecorator(RequestType.HEAD);

export const Cached =
  (duration: WaitPeriod, persist: boolean = false, method = CachingMethod.HIT_FIRST) =>
  (target: any, propertyKey: string) => {
    const proto = createProps(target.constructor);
    const cacheLens = R.lensPath(["methodConfig", propertyKey, "cache"]);
    proto.__internal__ = R.set(cacheLens, { duration, persist, method }, proto.__internal__);
  };
