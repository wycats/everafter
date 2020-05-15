import { isDebuggable, DEBUG, Debuggable } from "./debuggable";
import { frameSource } from "./callers";
import type { StackTraceyFrame } from "stacktracey";

/**
 * Make this a class so we get a nominal type (so it can be compared
 * with other {@link IntoStructured} types).
 */
export abstract class Structured {
  declare abstract type: string;
  abstract print(): string;
}

export class Struct extends Structured {
  #name: string;
  #fields: readonly [string, Structured][];

  constructor(name: string, fields: readonly [string, Structured][]) {
    super();
    this.#name = name;
    this.#fields = fields || null;
  }

  get type(): string {
    return this.#name;
  }

  print(): string {
    let fields = this.#fields.map(([key, value]) => {
      return `${key}: ${printStructured(value, true)}`;
    });
    return `${this.#name} { ${fields.join(", ")} }`;
  }
}

export class Newtype extends Structured {
  #name: string;
  #body: Structured | null;

  constructor(name: string, body?: Structured) {
    super();
    this.#name = name;
    this.#body = body || null;
  }

  get type(): string {
    return this.#name;
  }

  print(): string {
    if (this.#body) {
      return `${this.#name} { ${printStructured(this.#body, true)} }`;
    } else {
      return this.#name;
    }
  }
}

export class List extends Structured {
  #value: Structured[];

  constructor(value: Structured[]) {
    super();
    this.#value = value;
  }

  get type(): string {
    let types = new Set(this.#value.map(s => s.type));

    if (types.size === 1) {
      return `${[...types][0]}[]`;
    } else {
      return `unknown[]`;
    }
  }

  print(): string {
    return `[${this.#value
      .map(item => printStructured(item, true))
      .join(", ")}]`;
  }
}

export type IntoStructured =
  | Structured
  | Debuggable
  | StackTraceyFrame
  | readonly IntoStructured[];

function isArray<T>(input: unknown | T[]): input is readonly T[] {
  return Array.isArray(input);
}

function intoStructured(input: IntoStructured): Structured {
  if (isArray(input)) {
    return new List(input.map(intoStructured));
  }

  if (input instanceof Structured) {
    return input;
  } else if (isDebuggable(input)) {
    return input[DEBUG]();
  } else {
    return description(frameSource(input));
  }
}

export function struct(
  name: string,
  ...fields: readonly [string, IntoStructured][]
): Structured {
  return new Struct(
    name,
    fields.map(([key, into]) => [key, intoStructured(into)])
  );
}

export function newtype(name: string, body: IntoStructured): Structured {
  return new Newtype(name, intoStructured(body));
}

export function description(name: string): Structured {
  return new Newtype(name);
}

export function printStructured(
  input: IntoStructured,
  verbose: boolean
): string {
  let structured = intoStructured(input);

  if (verbose === false) {
    return structured.type;
  }

  return structured.print();
}
