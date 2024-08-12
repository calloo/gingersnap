import { Decoder } from "./type";

/**
 * Converts Blob to JSON object
 */
export class JSONDecoder implements Decoder<Record<any, any>> {
  async decode(data: Blob) {
    return JSON.parse(await data.text());
  }
}
