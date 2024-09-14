import { Decoder } from "../data/decoders";
import { NetworkService } from "./NetworkService";
import { CacheManager } from "../data/store/manager";

export { NetworkService } from "./NetworkService";
export { WebSocketService } from "./SocketService";
export { EventSourceService } from "./EventSourceService";
export { request } from "./request";
export {
  GET,
  PUT,
  POST,
  DELETE,
  PATCH,
  OPTIONS,
  HEAD,
  DataDecoder,
  Take,
  Skip,
  IgnoreCache,
  ReplyableStream,
  WriteStream,
  MatcherValue,
  MatcherKey,
  ReadStream,
  NoAuth,
  HeaderMap,
  Header,
  Query,
  Path,
  QueryMap,
  StringBody,
  XMLBody,
  JSONBody,
  OptionalField,
  Field,
  Part,
  AuthRefresher,
  Authenticator,
  ThrottleBy,
  Throttle,
  Headers,
  FormUrlEncoded,
  Multipart,
  NoResponse,
  BinaryResponse,
  StringResponse,
  XMLResponse,
  JSONResponse,
  BaseUrl,
  Cached,
  RequestReply,
} from "./decorators";
export { ReplyStreamDirection, MapOfHeaders, ParamHeaders, MapOfQueries, MapOfPath, NONE, PASS } from "./types";
export * from "./http";

export interface GingerSnapProps {
  baseUrl?: string;
  retryLimit?: number;
  decoder?: Decoder<any>;
  cacheManager?: CacheManager;
  [string: string]: any;
}

const DEFAULT_RETRY_LIMIT = 3;

/**
 * Core Service for creating Snap Services - services that manage network requests
 */
export class GingerSnap {
  /**
   * The baseUrl used by all snap services
   * @private
   */
  private readonly baseUrl?: string;

  /**
   * The retry limit used by all snap services
   * @private
   */
  private readonly retryLimit: number;

  constructor({ baseUrl, retryLimit = DEFAULT_RETRY_LIMIT }: GingerSnapProps = {}) {
    this.baseUrl = baseUrl;
    this.retryLimit = retryLimit;
  }

  /**
   * Creates a new instance of the provided SnapService
   * @param Class A SnapService class
   * @param args
   */
  public create<T extends NetworkService>(Class: new (v: GingerSnapProps) => T, args?: GingerSnapProps): T {
    const instance = new Class({
      ...(args ?? {}),
      baseUrl: args?.baseUrl ?? this.baseUrl,
      retryLimit: args?.retryLimit ?? this.retryLimit,
    });
    (instance as any).__setup__();
    return instance;
  }
}
