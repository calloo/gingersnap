import { Decoder } from "./type";
import { decode as msgUnpack } from "@msgpack/msgpack";

/**
 * Converts Blob to JSON object that was packaged using msgpack
 */
export class MsgpackDecoder<T> implements Decoder<T> {
  decode(data: ArrayBuffer) {
    return msgUnpack(new Uint8Array(data)) as T;
  }
}
