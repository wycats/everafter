import type { Structured } from "./structured";
import type { Dict } from "../utils";

export const DEBUG = Symbol("DEBUG");

export interface Debuggable {
  [DEBUG](): Structured;

  // this is a string property for ease of use in the inspector
  debugFields?: DebugFields;
}

export function isDebugFields(
  input: unknown
): input is { debugFields: DebugFields } {
  if (input === null || typeof input !== "object") {
    return false;
  }

  return "debugFields" in (input as object);
}

export function isDebuggable(input: unknown): input is Debuggable {
  if (input === null || typeof input !== "object") {
    return false;
  }

  return DEBUG in (input as object);
}

export class DebugFields {
  constructor(private name: string, private values: Dict<unknown>) {}

  get debug(): [string, Dict] {
    let out: Dict = {};
    for (let [key, value] of Object.entries(this.values)) {
      if (isDebugFields(value)) {
        out[key] = value.debugFields.debug;
      } else {
        out[key] = value;
      }
    }

    return [this.name, out];
  }
}
