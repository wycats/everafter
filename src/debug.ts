import { Dict, unreachable } from "./utils";
import type { Output } from "./output";
import type { Operations } from "./ops";
import type { UserBlock, AbstractOutput } from "./interfaces";
import StackTracey, { StackTraceyFrame } from "stacktracey";
import type { Updater } from "./update";

export const DEBUG = Symbol("DEBUG");

export interface Debuggable {
  [DEBUG](): Structured;

  // this is a string property for ease of use in the inspector
  debugFields?: DebugFields;
}

export const enum LogLevel {
  Info = "Info",
  Internals = "Internals",
}

export interface Struct {
  type: "struct";
  name: string;
  fields: readonly [string, Structured][];
}

export interface Newtype {
  type: "newtype";
  name: string;
  body?: Structured;
}

// export interface StructuredString {
//   type: "string";
//   value: string;
// }

export interface List {
  type: "list";
  value: Structured[];
}

export type Structured = Struct | Newtype | List;

export type IntoStructured =
  | Structured
  | Debuggable
  | readonly IntoStructured[];

function isArray<T>(input: unknown | T[]): input is readonly T[] {
  return Array.isArray(input);
}

function structureType(structured: Structured): string {
  switch (structured.type) {
    case "struct":
      return structured.name;
    case "newtype":
      return structured.name;
    case "list": {
      let types = new Set(structured.value.map(structureType));

      if (types.size === 1) {
        return `${[...types][0]}[]`;
      } else {
        return `unknown[]`;
      }
    }
  }
}

function intoStructured(input: IntoStructured): Structured {
  if (isArray(input)) {
    return {
      type: "list",
      value: input.map(intoStructured),
    };
  }

  if (isDebuggable(input)) {
    return input[DEBUG]();
  } else {
    return input;
  }
}

export function struct(
  name: string,
  ...fields: readonly [string, IntoStructured][]
): Structured {
  return {
    type: "struct",
    name,
    fields: fields.map(([name, value]) => [name, intoStructured(value)]),
  };
}

function printStruct(struct: Struct): string {
  let fields = struct.fields.map(([key, value]) => {
    return `${key}: ${printStructured(value, true)}`;
  });
  return `${struct.name} { ${fields.join(", ")} }`;
}

export function newtype(name: string, body: Structured): Structured {
  return { type: "newtype", name, body };
}

export function description(name: string): Structured {
  return { type: "newtype", name };
}

function printNewtype(newtype: Newtype): string {
  if (newtype.body) {
    return `${newtype.name} { ${printStructured(newtype.body, true)} }`;
  } else {
    return newtype.name;
  }
}

function printList(list: List): string {
  return `[${list.value.map(item => printStructured(item, true)).join(", ")}]`;
}

export function printStructured(
  input: IntoStructured,
  verbose: boolean
): string {
  let structured = intoStructured(input);

  if (typeof structured === "string") {
    return structured;
  } else {
    if (verbose === false) {
      return structureType(structured);
    }

    switch (structured.type) {
      case "struct":
        return printStruct(structured);
      case "newtype":
        return printNewtype(structured);
      case "list":
        return printList(structured);
      default:
        unreachable(structured);
    }
  }
}

export interface Logger {
  begin(messageLevel: LogLevel, hostLevel: LogLevel, string: string): void;
  result(
    level: LogLevel,
    hostLevel: LogLevel,
    string: string,
    ...style: string[]
  ): void;
  end(level: LogLevel, hostLevel: LogLevel, string: string): void;
  log(
    messageLevel: LogLevel,
    hostLevel: LogLevel,
    string: string,
    ...style: string[]
  ): void;
  indent<T>(messageLevel: LogLevel, hostLevel: LogLevel, callback: () => T): T;
}

export function shouldShow(
  loggerLevel: LogLevel,
  messageLevel: LogLevel
): boolean {
  switch (loggerLevel) {
    case LogLevel.Info:
      return messageLevel !== LogLevel.Internals;
    case LogLevel.Internals:
      return true;
  }
}

export class ConsoleLogger implements Logger {
  #showStackTrace: boolean;
  #indent = 0;

  constructor(showStackTrace: boolean) {
    this.#showStackTrace = showStackTrace;
  }

  indent<T>(messageLevel: LogLevel, hostLevel: LogLevel, callback: () => T): T {
    if (shouldShow(hostLevel, messageLevel)) {
      this.#indent++;
    }

    try {
      return callback();
    } finally {
      if (shouldShow(hostLevel, messageLevel)) {
        this.#indent--;
      }
    }
  }

  increaseIndent(): void {
    this.#indent++;
  }

  decreaseIndent(): void {
    this.#indent--;
  }

  private logMethod(level: LogLevel): "debug" | "info" {
    switch (level) {
      case LogLevel.Info:
        return "info";
      case LogLevel.Internals:
        return "debug";
      default:
        unreachable(level);
    }
  }

  private logWithStackTrace(
    method: "debug" | "info",
    message: string,
    ...args: string[]
  ): void {
    let indented = `${"  ".repeat(this.#indent)}${message}`;

    if (this.#showStackTrace) {
      console.groupCollapsed(indented, ...args);
      console.trace();
      console.groupEnd();
    } else {
      console[method](indented, ...args);
    }
  }

  log(
    messageLevel: LogLevel,
    hostLevel: LogLevel,
    message: string,
    ...style: string[]
  ): void {
    if (!shouldShow(hostLevel, messageLevel)) {
      return;
    }

    let args: [string, ...string[]] = style.length
      ? [`${"  ".repeat(this.#indent)}%c${message}`, ...style]
      : [`${"  ".repeat(this.#indent)}${message}`];

    this.logWithStackTrace(this.logMethod(messageLevel), ...args);
  }

  begin(messageLevel: LogLevel, hostLevel: LogLevel, string: string): void {
    if (!shouldShow(hostLevel, messageLevel)) {
      return;
    }

    this.logWithStackTrace(this.logMethod(messageLevel), `-> ${string}`);
  }

  result(
    messageLevel: LogLevel,
    hostLevel: LogLevel,
    string: string,
    ...style: string[]
  ): void {
    if (!shouldShow(hostLevel, messageLevel)) {
      return;
    }

    let message = style.length ? `[RESULT] %c${string}` : `[RESULT] ${string}`;

    this.logWithStackTrace(this.logMethod(messageLevel), message, ...style);
  }

  end(messageLevel: LogLevel, hostLevel: LogLevel, string: string): void {
    if (!shouldShow(hostLevel, messageLevel)) {
      return;
    }
    let message = `<- %c${string}`;

    this.logWithStackTrace("debug", message, "color: #999");
  }
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

export function callerFrame(depth: number): StackTraceyFrame {
  let trace = new StackTracey();
  return trace.withSource(depth);
}

export function callerLocation(depth: number): Structured {
  return description(frameSource(callerFrame(depth)));
  // return frameSource(callerFrame(depth));
}

export function frameSource(frame: StackTraceyFrame): string {
  let file = frame.file;
  file = file.replace(/^webpack:\/\/\/(tests|src)/, "webpack:///./$1");
  return `${file}:${frame.line}:${frame.column}`;
}

export function block<Ops extends Operations>(
  invoke: (output: Output<Ops>, inner: AbstractOutput<Ops>) => Updater | void,
  depth = 3
): UserBlock<Ops> {
  return {
    desc: callerLocation(depth),
    invoke,
  };
}

export function internalBlock<Ops extends Operations>(
  invoke: (output: Output<Ops>, inner: AbstractOutput<Ops>) => Updater | void,
  depth: number
): UserBlock<Ops> {
  return {
    desc: callerLocation(depth),
    invoke,
  };
}

export interface AnnotatedFunction<F extends Function> {
  f: F;
  source: StackTraceyFrame;
}

export function annotate<F extends Function>(
  f: F | AnnotatedFunction<F>,
  depth = 2
): AnnotatedFunction<F> {
  if (typeof f === "function") {
    return {
      f,
      source: callerFrame(depth),
    };
  } else {
    return f;
  }
}
