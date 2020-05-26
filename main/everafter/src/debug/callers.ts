import StackTracey, { StackTraceyFrame } from "stacktracey";
import { unwrap } from "../utils";
import { DEBUG, Debuggable } from "./debuggable";
import { description, Structured } from "./structured";

export class Source implements Debuggable {
  #frame: StackTraceyFrame;
  #desc: string | null;

  constructor(frame: StackTraceyFrame, desc?: string) {
    this.#frame = frame;
    this.#desc = desc || null;
  }

  get desc(): string | null {
    return this.#desc;
  }

  [DEBUG](): Structured {
    if (this.#desc) {
      return description(`${this.#desc} at ${this.description}`);
    } else {
      return description(this.description);
    }
  }

  withDefaultDescription(description: string): Source {
    if (this.#desc) {
      return this;
    } else {
      return this.describe(description);
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

const ANNOTATIONS = new WeakMap<object, Source>();
const ANNOTATION = Symbol("ANNOTATION");
type ANNOTATION = typeof ANNOTATION;

export type AnnotatedFunction<F extends Function> = Annotated<F>;
export type Annotated<T> = T & { [ANNOTATION]: true };

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

export function withDefaultDescription<F extends Function>(
  f: AnnotatedFunction<F>,
  desc: string
): AnnotatedFunction<F> {
  let source = getSource(f).withDefaultDescription(desc);
  return annotate(f, source);
}

/**
 * A general-purpose function annotater. It attaches an annotation about the
 * caller's source location to the function.
 */
export function annotate<F extends object>(f: F, desc: Source): Annotated<F> {
  let source = desc instanceof Source ? desc : caller(PARENT, desc);

  ANNOTATIONS.set(f, source);
  return f as Annotated<F>;
}

/**
 * A general-purpose function annotater. It attaches an annotation about the
 * caller's source location to the function.
 */
export function f<F extends Function>(
  f: F,
  desc: Source = caller(PARENT)
): AnnotatedFunction<F> {
  let source = desc instanceof Source ? desc : caller(PARENT, desc);

  ANNOTATIONS.set(f, source);
  return f as AnnotatedFunction<F>;
}

/**
 * A general-purpose function annotater. It attaches an annotation about the
 * caller's source location to the function.
 */
export function named<F extends Function>(
  f: F,
  desc: string | Source
): AnnotatedFunction<F> {
  let source = desc instanceof Source ? desc : caller(PARENT, desc);

  ANNOTATIONS.set(f, source);
  return f as AnnotatedFunction<F>;
}
