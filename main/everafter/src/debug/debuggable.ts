import type { Structured } from "./structured";

export const DEBUG = Symbol("DEBUG");

export interface Debuggable {
  [DEBUG](): Structured;
}

export function isDebuggable(input: unknown): input is Debuggable {
  if (input === null || typeof input !== "object") {
    return false;
  }

  return DEBUG in (input as object);
}
