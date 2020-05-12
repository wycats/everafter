export interface Dict<T = unknown> {
  [key: string]: T;
}

export function unreachable(_value: never): never {
  throw new Error(`unreachable`);
}

export function unwrap<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error(`unexpected null`);
  }

  return value;
}

export const DEBUG = Symbol("DEBUG");

export interface Debuggable {
  debugFields: DebugFields;
}

export function isDebuggable(input: unknown): input is Debuggable {
  if (input === null || typeof input !== "object") {
    return false;
  }

  return "debugFields" in (input as object);
}

export class DebugFields {
  constructor(private name: string, private values: Dict<unknown>) {}

  get debug(): [string, Dict] {
    let out: Dict = {};
    for (let [key, value] of Object.entries(this.values)) {
      if (isDebuggable(value)) {
        out[key] = value.debugFields.debug;
      } else {
        out[key] = value;
      }
    }

    return [this.name, out];
  }
}
