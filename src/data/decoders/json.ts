import { Decoder } from "./type";

/**
 * Converts Blob to JSON object
 */
export class JSONDecoder implements Decoder<Record<any, any>> {
  decode(data: ArrayBuffer) {
    return JSON.parse(new TextDecoder().decode(data));
  }
}
