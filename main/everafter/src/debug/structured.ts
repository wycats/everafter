import { isDebuggable, DEBUG, Debuggable } from "./debuggable";
import type { Dict } from "../utils";
import { maybeGetSource } from "./callers";
import type { Updater } from "../update";

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

function isArray<T>(input: unknown | T[]): input is readonly T[] {
  return Array.isArray(input);
}

export function intoStructured(input: unknown): Structured | undefined {
  if (isArray(input)) {
    let items = input.map(intoStructured).filter(item => item !== undefined);
    return new List(items as Structured[]);
  }

  if (input instanceof Structured) {
    return input;
  } else {
    if (input === null) {
      return description("null");
    }

    if (
      (typeof input === "object" && input !== null) ||
      typeof input === "function"
    ) {
      let source = maybeGetSource(input);

      if (source) {
        return source[DEBUG]();
      } else if (isDebuggable(input)) {
        return input[DEBUG]();
      } else {
        return;
      }
    }

    return description(String(input));
  }
}

export function struct(name: string, fields: Dict<unknown>): Structured {
  return new Struct(
    name,
    Object.keys(fields)
      .map(key => [key, intoStructured(fields[key])])
      .filter(([, value]) => value !== undefined)
  );
}

export function newtype(name: string, body: unknown): Structured {
  return new Newtype(name, intoStructured(body));
}

export function description(name: string): Structured {
  return new Newtype(name);
}

export function printStructured(
  intoStructured: Structured | Debuggable,
  verbose: boolean
): string {
  let structured = isDebuggable(intoStructured)
    ? intoStructured[DEBUG]()
    : intoStructured;

  if (verbose === false) {
    return structured.type;
  }

  return structured.print();
}

export function anything(input: unknown): Structured {
  if (input instanceof Structured) {
    return input;
  } else if (isDebuggable(input)) {
    return input[DEBUG]();
  } else if (Array.isArray(input)) {
    return new List(input.map(anything));
  } else {
    if (input === null) {
      return description("null");
    }

    switch (typeof input) {
      case "undefined":
      case "boolean":
      case "number":
        return description(String(input));
      case "symbol":
        return newtype("symbol", description(input.description || "anonymous"));
      case "string":
        return newtype("string", description(input));
      case "bigint":
        return newtype("bigint", description(String(input)));
      case "function":
        return description("Function");
      case "object": {
        if (input === null) {
          return description("null");
        } else {
          return description("object");
        }
      }
      default:
        throw new Error(`unexpected unreachable`);
    }
  }
}
