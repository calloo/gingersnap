import * as R from "ramda";

export interface ParserMap {
  string: Function;
  object: Function;
  default: Function;
  supportArray?: boolean;
}

export const parse = R.curry((mapping: ParserMap, data: any) => {
  if (typeof data === "string") {
    return mapping.string(data);
  } else if (mapping.supportArray && (Array.isArray(data) || data instanceof Array)) {
    return data.map((v) => parse(mapping, v));
  } else if (!(Array.isArray(data) || data instanceof Array) && typeof data === "object") {
    return mapping.object(data);
  }
  return mapping.default(data);
});
