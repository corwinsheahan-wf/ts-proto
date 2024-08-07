import { TypeMap } from "./types";
import { Utils } from "./main";

/** Provides a parameter object for passing around the various context/config data. */
export interface BaseContext {
  typeMap: TypeMap;
  utils: Utils;
}
