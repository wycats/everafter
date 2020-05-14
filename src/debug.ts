import StackTracey, { StackTraceyFrame } from "stacktracey";
import type { UserBlock, UserBlockFunction } from "./interfaces";
import type { Operations } from "./ops";
import type { Output } from "./output";
import type { Updater } from "./update";
import { Dict, unreachable } from "./utils";

export const DEBUG = Symbol("DEBUG");

export interface Debuggable {
  [DEBUG](): Structured;

  // this is a string property for ease of use in the inspector
  debugFields?: DebugFields;
}

export interface LogFilter {
  info: boolean;
  internals: boolean;
  warnings: boolean;
}

export const ALL_LOGS = {
  info: true,
  internals: true,
  warnings: true,
};

export const INFO_LOGS = {
  info: true,
  internals: false,
  warnings: true,
};

export const WARNING_LOGS = {
  info: false,
  internals: false,
  warnings: true,
};

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
  begin(messageLevel: LogLevel, filter: LogFilter, string: string): void;
  result(
    level: LogLevel,
    filter: LogFilter,
    string: string,
    ...style: string[]
  ): void;
  end(level: LogLevel, filter: LogFilter, string: string): void;
  log(
    messageLevel: LogLevel,
    filter: LogFilter,
    string: string,
    ...style: string[]
  ): void;
  indent<T>(messageLevel: LogLevel, filter: LogFilter, callback: () => T): T;
}

export function shouldShow(filter: LogFilter, level: LogLevel): boolean {
  switch (level) {
    case LogLevel.Info:
      return filter.info;
    case LogLevel.Internals:
      return filter.internals;
  }
}

export class ConsoleLogger implements Logger {
  #showStackTrace: boolean;
  #indent = 0;

  constructor(showStackTrace: boolean) {
    this.#showStackTrace = showStackTrace;
  }

  indent<T>(level: LogLevel, filter: LogFilter, callback: () => T): T {
    if (shouldShow(filter, level)) {
      this.#indent++;
    }

    try {
      return callback();
    } finally {
      if (shouldShow(filter, level)) {
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
    level: LogLevel,
    filter: LogFilter,
    message: string,
    ...style: string[]
  ): void {
    if (!shouldShow(filter, level)) {
      return;
    }

    let args: [string, ...string[]] = style.length
      ? [`${"  ".repeat(this.#indent)}%c${message}`, ...style]
      : [`${"  ".repeat(this.#indent)}${message}`];

    this.logWithStackTrace(this.logMethod(level), ...args);
  }

  begin(level: LogLevel, filter: LogFilter, string: string): void {
    if (!shouldShow(filter, level)) {
      return;
    }

    this.logWithStackTrace(this.logMethod(level), `-> ${string}`);
  }

  result(
    level: LogLevel,
    filter: LogFilter,
    string: string,
    ...style: string[]
  ): void {
    if (!shouldShow(filter, level)) {
      return;
    }

    let message = style.length ? `[RESULT] %c${string}` : `[RESULT] ${string}`;

    this.logWithStackTrace(this.logMethod(level), message, ...style);
  }

  end(level: LogLevel, filter: LogFilter, string: string): void {
    if (!shouldShow(filter, level)) {
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

/**
 * The number of frames to walk back to find the frame
 * of the code calling callerFrame.
 */
export const CURRENT = 1;

/**
 * The number of frames to walk back to find the direct caller
 * of the code calling callerFrame.
 *
 * You need to go back one frame to find the caller of callerFrame,
 * and one more to find the caller of that frame.
 */
export const PARENT = 2;

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
  invoke: (output: Output<Ops>) => Updater | void,
  depth = 3
): UserBlock<Ops> {
  return {
    desc: callerLocation(depth),
    invoke,
  };
}

export function internalBlock<Ops extends Operations>(
  invoke: (output: Output<Ops>) => Updater | void,
  depth: number
): UserBlock<Ops> {
  return {
    desc: callerLocation(depth),
    invoke,
  };
}

export function annotatedBlock<Ops extends Operations>(
  invoke: UserBlockFunction<Ops>,
  location: StackTraceyFrame
): UserBlock<Ops> {
  return {
    desc: description(frameSource(location)),
    invoke,
  };
}

export interface AnnotatedFunction<F extends Function> {
  f: F;
  source: StackTraceyFrame;
}

export function copyAnnotation<F extends Function>(
  original: AnnotatedFunction<Function>,
  target: F
): AnnotatedFunction<F> {
  return {
    f: target,
    source: original.source,
  };
}

export function annotateWithFrame<F extends Function>(
  f: F,
  source: StackTraceyFrame
): AnnotatedFunction<F> {
  return {
    f,
    source,
  };
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
