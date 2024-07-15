import { Credentials } from "../data/model/credentials";
import { DataFormat } from "../data/model";
import { WaitPeriod } from "../future";

export enum RequestType {
  GET = "GET",
  PUT = "PUT",
  POST = "POST",
  DELETE = "DELETE",
  PATCH = "PATCH",
  OPTIONS = "OPTIONS",
  HEAD = "HEAD",
}

export enum ReplyStreamDirection {
  TO = "TO",
  FROM = "FROM",
  BI_DIRECTIONAL = "BI_DIRECTIONAL",
}

export enum ResponseType {
  STRING = 1,
  XML,
  JSON,
  BINARY,
  NONE,
}

export enum BodyType {
  STRING = 1,
  XML,
  JSON,
  MULTIPART,
  FORMURLENCODED,
}

export interface ThrottleByProps {
  waitPeriodInMs?: number;
}

interface BodyProps<T extends BodyType> {
  type: T;
}

interface MultiPartBodyProps extends BodyProps<BodyType.MULTIPART> {
  parts: { [string: string]: number };
}

interface FormURLEncodedBodyProps extends BodyProps<BodyType.FORMURLENCODED> {
  fields?: { [string: string]: number };
  optionalFields?: { [string: string]: number };
}

interface StringBodyProps extends BodyProps<BodyType.STRING> {
  parameterIndex: number;
}

interface JSONBodyProps extends BodyProps<BodyType.JSON> {
  parameterIndex: number;
  fields?: { [string: string]: number };
  optionalFields?: { [string: string]: number };
}

interface XMLBodyProps extends BodyProps<BodyType.XML> {
  parameterIndex: number;
}

export interface MethodConfiguration {
  cache: WaitPeriod;
  authenticator?: {
    type: Credentials;
    global?: boolean;
  };
  authRefresher?: {
    type: Credentials;
    global?: boolean;
  };
  noAuth?: boolean;
  requestType?: RequestType;
  apiPath?: string;
  headers?: MapOfHeaders;
  responseType?: ResponseType;
  responseClass?: any;
  responseArray?: boolean;
  throttle?: ThrottleByProps;
  dataFormat?: DataFormat;
  socketReadStream?: {
    value: string | RegExp;
    model: any;
    keyPath: string | Array<string | number>;
    array: boolean;
    take?: number;
    skip?: number;
    ignoreCache?: boolean;
  };
  socketWriteStream?: boolean;
  customTags?: Array<{
    name: string;
    [string: string]: any;
  }>;
  parameters?: {
    body?: MultiPartBodyProps | FormURLEncodedBodyProps | StringBodyProps | JSONBodyProps | XMLBodyProps;
    headers?: MapOfHeaders;
    queries?: MapOfQueries;
    pathVariables?: MapOfPath;
  };
}

export interface ServiceInternalProps {
  classConfig: {
    baseUrl?: string;
    Decoder?: any;
  };
  methodConfig: {
    [string: string]: MethodConfiguration;
  };
}

export type MapOfHeaders = Record<string, string>;
export type ParamHeaders = Record<string, number>;
export type MapOfQueries = Record<string, number>;
export type MapOfPath = Record<string, number>;
export type NONE = null;
export const PASS = null as any;
