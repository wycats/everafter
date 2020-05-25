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

export const UNDEFINED = Symbol("UNDEFINED");
export type UNDEFINED = typeof UNDEFINED;
