import StackTracey, { StackTraceyFrame } from "stacktracey";
import type { BlockFunction, Block } from "../interfaces";
import { Debuggable, DEBUG } from "./debuggable";
import { Structured, description } from "./structured";
import { unwrap } from "../utils";

export class Source implements Debuggable {
  #frame: StackTraceyFrame;
  #desc: string | null;

  constructor(frame: StackTraceyFrame, desc?: string) {
    this.#frame = frame;
    this.#desc = desc || null;
  }

  [DEBUG](): Structured {
    if (this.#desc) {
      return description(`${this.#desc} at ${this.description}`);
    } else {
      return description(this.description);
    }
  }

  describe(description: string): Source {
    return new Source(this.#frame, description);
  }

  get description(): string {
    let file = this.#frame.file;
    file = file.replace(/^webpack:\/\/\/(tests|src)/, "webpack:///./$1");
    return `${file}:${this.#frame.line}:${this.#frame.column}`;
  }
}

export function source(frame: StackTraceyFrame, desc?: string): Source {
  return new Source(frame, desc);
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

export function caller(depth: number, desc?: string): Source {
  let trace = new StackTracey();
  return new Source(trace.withSource(depth), desc);
}

const ANNOTATIONS = new WeakMap<Function, Source>();
const ANNOTATION = Symbol("ANNOTATION");
type ANNOTATION = typeof ANNOTATION;

export type AnnotatedFunction<F extends Function> = F & { [ANNOTATION]: true };

export function isAnnotated(v: unknown): v is AnnotatedFunction<Function> {
  return typeof v === "function" && ANNOTATIONS.has(v);
}

export function getSource(func: AnnotatedFunction<Function>): Source {
  return unwrap(ANNOTATIONS.get(func));
}

export function copyAnnotation<F extends Function>(
  original: AnnotatedFunction<Function>,
  target: F
): AnnotatedFunction<F> {
  ANNOTATIONS.set(target, unwrap(ANNOTATIONS.get(original)));
  return target as AnnotatedFunction<F>;
}

/**
 * A general-purpose function annotater. It attaches an annotation about the
 * caller's source location to the function.
 */
export function annotate<F extends Function>(
  f: F,
  source = caller(PARENT)
): AnnotatedFunction<F> {
  ANNOTATIONS.set(f, source);
  return f as AnnotatedFunction<F>;
}

/**
 * Annotate a {@link UserBlockFunction}. The main reason this function exists
 * is to get better type feedback if you pass the wrong kind of function in.
 *
 * Otherwise, it's fine to use {@link annotate}.
 */
export function block<Cursor, Atom>(
  invoke: BlockFunction<Cursor, Atom>,
  frame = caller(PARENT)
): Block<Cursor, Atom> {
  return annotate(invoke, frame);
}
