/**
 * Used for converting data from Blob to a given format
 */
export interface Decoder<T> {
  decode: (data: ArrayBuffer) => T;
  load?: () => void;
}
