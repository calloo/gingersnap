import { BodyType, MapOfHeaders, ResponseType, ServiceInternalProps, ThrottleByProps } from "../types";
import * as R from "ramda";
import "reflect-metadata";
import { DataFormat } from "../../data/model";

interface ResponseDetails {
  modelType?: any;
  modelTypeMapping?: { [string: string]: any };
  modelTypeKeyPath?: string | Array<string | number>;
  isArray?: boolean;
  format?: DataFormat;
}
/// //// Constants ///////
export const THROTTLE_DEFAULT_MS = 3000;
const SUPPORTED_HEADER_VALUES = ["String", "Number", "Boolean"];

/// // // Helpers ///////
export const createProps = (constructor: any) => {
  const proto: { __internal__: ServiceInternalProps } = constructor.prototype;
  if (proto.__internal__ === undefined) {
    proto.__internal__ = { classConfig: {}, methodConfig: {} };
  }
  return proto;
};

const createResponseDecorator =
  (type: ResponseType) =>
  (
    { modelType, format, isArray, modelTypeMapping, modelTypeKeyPath }: ResponseDetails = {
      modelType: String,
      isArray: false,
    }
  ) =>
  (target: any, propertyKey: string) => {
    const proto = createProps(target.constructor);
    const lens = R.lensPath(["methodConfig", propertyKey, "responseType"]);
    const formatLens = R.lensPath(["methodConfig", propertyKey, "dataFormat"]);
    const typeLens = R.lensPath(["methodConfig", propertyKey, "responseClass"]);
    const isArrayLens = R.lensPath(["methodConfig", propertyKey, "responseArray"]);
    proto.__internal__ = R.set(lens, type, proto.__internal__);
    proto.__internal__ = R.set(typeLens, modelType, proto.__internal__);
    proto.__internal__ = R.set(isArrayLens, isArray, proto.__internal__);
    proto.__internal__ = R.set(formatLens, format, proto.__internal__);
  };

const createRequestBodyDecorator = (type: BodyType) => (target: any, propertyKey: string, parameterIndex: number) => {
  const proto = createProps(target.constructor);
  const lens = R.lensPath(["methodConfig", propertyKey, "parameters", "body"]);
  proto.__internal__ = R.set(lens, { type, parameterIndex }, proto.__internal__);
};

const createRequestMultiBodyDecorator = (type: BodyType) => (target: any, propertyKey: string) => {
  const proto = createProps(target.constructor);
  const lens = R.lensPath(["methodConfig", propertyKey, "parameters", "body"]);
  const changer = R.compose(R.mergeDeepLeft({ type }), R.or<any, any>(R.__, {}));
  proto.__internal__ = R.over(lens, changer, proto.__internal__);
};

const createRequestMultiBodyParameterDecorator =
  (key: string) => (value: string) => (target: any, propertyKey: string, parameterIndex: number) => {
    const proto = createProps(target.constructor);
    const lens = R.lensPath(["methodConfig", propertyKey, "parameters", "body", key]);
    const changer = R.compose(R.mergeDeepLeft({ [value]: parameterIndex }), R.or<any, any>(R.__, {}));
    proto.__internal__ = R.over(lens, changer, proto.__internal__);
  };

/**
 * Sets the host for the Snap Service
 * @param value host
 * @constructor
 */
export const BaseUrl = (value: string) => (constructor: any) => {
  const proto = createProps(constructor);
  proto.__internal__.classConfig.baseUrl = value;
};

/**
 * Marks the SnapService method as on that returns a JSON Response of a specific Model type
 */
export const JSONResponse = createResponseDecorator(ResponseType.JSON);

/**
 * Marks the SnapService method as on that returns a XML Response of a specific Model type
 */
export const XMLResponse = createResponseDecorator(ResponseType.XML);

/**
 * Marks the SnapService method as on that returns a String Response
 */
export const StringResponse = createResponseDecorator(ResponseType.STRING)({ modelType: String });

/**
 * Marks the SnapService method as on that returns a Blob
 */
export const BinaryResponse = createResponseDecorator(ResponseType.BINARY)({ modelType: Blob });

/**
 * Marks the SnapService method as on that has no return value
 */
export const NoResponse = createResponseDecorator(ResponseType.NONE)();

/**
 * Marks the SnapService method that it should use multipart/form-data when submitting the request
 */
export const Multipart = createRequestMultiBodyDecorator(BodyType.MULTIPART);

/**
 * Marks the SnapService method that it should use application/x-www-form-urlencoded when submitting the request
 */
export const FormUrlEncoded = createRequestMultiBodyDecorator(BodyType.FORMURLENCODED);

/**
 * Sets the headers for the request
 * @param value MapOfHeaders
 * @constructor
 */
export const Headers = (value: MapOfHeaders) => (target: any, propertyKey: string) => {
  const proto = createProps(target.constructor);
  const lens = R.lensPath(["methodConfig", propertyKey, "headers"]);
  const changer = R.compose(R.mergeDeepLeft(value), R.or<any, any>(R.__, {}));
  proto.__internal__ = R.over(lens, changer, proto.__internal__);
};

/**
 * Throttles the request by 3 seconds
 * @param target
 * @param propertyKey
 * @constructor
 */
export const Throttle = (target: any, propertyKey: string) => {
  const proto = createProps(target.constructor);
  const lens = R.lensPath(["methodConfig", propertyKey, "throttle"]);
  proto.__internal__ = R.set(lens, { waitPeriodInMs: THROTTLE_DEFAULT_MS }, proto.__internal__);
};

/**
 * Throttles the request by the value provided
 * @param value ThrottleByProps - An object that contains the waitPeriodInMs
 * @constructor
 */
export const ThrottleBy = (value: ThrottleByProps) => (target: any, propertyKey: string) => {
  const proto = createProps(target.constructor);
  const lens = R.lensPath(["methodConfig", propertyKey, "throttle"]);
  proto.__internal__ = R.set(lens, value, proto.__internal__);
};

/**
 * Marks this method as an authenticator. When requests receive 401 status code, this method will be called to retrieve
 * the credentials
 * @param type Credentials - Type of credentials that this authenticator should return
 * (BasicCredentials | BearerCredentials | APIKeyCredentials | define one of your own by subclassing Credentials)
 * @param global Whether this authenticator should be used across all services
 * @param socketField
 * @constructor
 */
export const Authenticator =
  <T>(type: T, global = false, socketField = "accessToken") =>
  (target: any, propertyKey: string) => {
    const proto = createProps(target.constructor);
    const lens = R.lensPath(["methodConfig", propertyKey, "authenticator"]);
    proto.__internal__ = R.over(lens, (v) => ({ ...(v ?? {}), type, global }), proto.__internal__);
  };

/**
 * Marks this method as an auth refresher. Whenever a request receives a 401 status code for invalid credentials, this
 * method will be called with the old Credentials, and should produce new credentials
 * @param type Credentials - Type of credentials that this authenticator should return
 * (BasicCredentials | BearerCredentials | APIKeyCredentials | define one of your own by subclassing Credentials)
 * @param global Whether this auth refresher should be used across all services
 * @constructor
 */
export const AuthRefresher =
  <T>(type: T, global = false) =>
  (target: any, propertyKey: string) => {
    const proto = createProps(target.constructor);
    const lens = R.lensPath(["methodConfig", propertyKey, "authRefresher"]);
    proto.__internal__ = R.over(lens, (v) => ({ ...(v ?? {}), type, global }), proto.__internal__);
  };

/**
 * Marks argument as a property in the MultiPart form
 */
export const Part = createRequestMultiBodyParameterDecorator("parts");

/**
 * Marks argument as a property in the FormUrlEncoded  form or a JSON payload
 */
export const Field = createRequestMultiBodyParameterDecorator("fields");

/**
 * Marks argument as a property in the FormUrlEncoded  form or JSON payload, but it can be missing
 */
export const OptionalField = createRequestMultiBodyParameterDecorator("OptionalFields");

/**
 * Marks argument that should be deserialized to a JSON string and attached as the body of the request
 */
export const JSONBody = createRequestBodyDecorator(BodyType.JSON);

/**
 * Marks argument that should be deserialized to XML string and attached as the body of the request
 */
export const XMLBody = createRequestBodyDecorator(BodyType.XML);

/**
 * Marks argument that should be the body of the request, and is a string
 */
export const StringBody = createRequestBodyDecorator(BodyType.STRING);

/**
 * Marks argument that should contain a Map of the queries used in the request. Argument should be an object with each
 * key value pair being the query name and value
 * @constructor
 */
export const QueryMap = (target: any, propertyKey: string, parameterIndex: number) => {
  const proto = createProps(target.constructor);
  const lens = R.lensPath(["methodConfig", propertyKey, "parameters", "queries"]);
  proto.__internal__ = R.over(
    lens,
    R.compose(R.mergeLeft<any, any>({ [Symbol(propertyKey)]: parameterIndex }, R.__), R.or<any, any>(R.__, {})),
    proto.__internal__
  );
};

/**
 * Marks argument as a path variable in the request url
 * @param value Name of the path variable
 * @constructor
 */
export const Path = (value: string) => {
  return (target: any, propertyKey: string, parameterIndex: number) => {
    const type: string = R.path(
      [parameterIndex, "name"],
      Reflect.getMetadata("design:paramtypes", target, propertyKey)
    )!;
    if (!["String", "Number"].includes(type)) {
      throw Error("Invalid type given for @Query. Should be of type string or number");
    }
    const proto = createProps(target.constructor);
    const lens = R.lensPath(["methodConfig", propertyKey, "parameters", "pathVariables"]);
    proto.__internal__ = R.over(
      lens,
      R.compose(R.mergeDeepWith(R.concat, { [value]: parameterIndex }), R.or<any, any>(R.__, {})),
      proto.__internal__
    );
  };
};

/**
 * Marks argument as a query to be attached to the request url
 * @param value Name of the query
 * @constructor
 */
export const Query = (value: string) => {
  return (target: any, propertyKey: string, parameterIndex: number) => {
    const proto = createProps(target.constructor);
    const lens = R.lensPath(["methodConfig", propertyKey, "parameters", "queries"]);
    proto.__internal__ = R.over(
      lens,
      R.compose(R.mergeDeepWith(R.concat, { [value]: parameterIndex }), R.or<any, any>(R.__, {})),
      proto.__internal__
    );
  };
};

/**
 * Marks argument as a header to be attached to the request
 * @param value Name of the header
 * @constructor
 */
export const Header = (value: string) => {
  return (target: any, propertyKey: string, parameterIndex: number) => {
    const type: string = R.path(
      [parameterIndex, "name"],
      Reflect.getMetadata("design:paramtypes", target, propertyKey)
    )!;
    if (!SUPPORTED_HEADER_VALUES.includes(type)) {
      throw Error("Invalid type given for @HeaderMap. Should be of type string, number or boolean");
    }
    const proto = createProps(target.constructor);
    const lens = R.lensPath(["methodConfig", propertyKey, "parameters", "headers"]);
    proto.__internal__ = R.over(
      lens,
      R.compose(R.mergeDeepWith(R.concat, { [value]: parameterIndex }), R.or<any, any>(R.__, {})),
      proto.__internal__
    );
  };
};

/**
 * Marks argument that should contain a Map of the headers used in the request. Argument should be an object with each
 * key value pair being the header name and value
 * @constructor
 */
export const HeaderMap = (target: any, propertyKey: string, parameterIndex: number) => {
  const proto = createProps(target.constructor);
  const lens = R.lensPath(["methodConfig", propertyKey, "parameters", "headers"]);
  const key = Symbol(propertyKey);
  proto.__internal__ = R.over(
    lens,
    R.compose(R.mergeLeft<any, any>({ [key]: parameterIndex }, R.__), R.or<any, any>(R.__, {})),
    proto.__internal__
  );
};

/**
 * Disables any authenticator that should be applied to this method
 * @constructor
 */
export const NoAuth = (target: any, propertyKey: string) => {
  const proto = createProps(target.constructor);
  const lens = R.lensPath(["methodConfig", propertyKey]);
  proto.__internal__ = R.set(lens, (v) => ({ ...(v ?? {}), noAuth: true }), proto.__internal__);
};
