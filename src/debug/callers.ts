import StackTracey, { StackTraceyFrame } from "stacktracey";
import type { Operations, UserBlock, UserBlockFunction } from "../interfaces";
import { Debuggable, DEBUG } from "./debuggable";
import { Structured, description } from "./structured";

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

export interface AnnotatedFunction<F extends Function> {
  f: F;
  source: Source;
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

function annotateWithFrame<F extends Function>(
  f: F,
  source: Source
): AnnotatedFunction<F> {
  return {
    f,
    source,
  };
}

/**
 * A general-purpose function annotater. It attaches an annotation about the
 * caller's source location to the function.
 */
export function annotate<F extends Function>(
  f: F,
  source = caller(PARENT)
): AnnotatedFunction<F> {
  return annotateWithFrame(f, source);
}

/**
 * Annotate a {@link UserBlockFunction}. The main reason this function exists
 * is to get better type feedback if you pass the wrong kind of function in.
 *
 * Otherwise, it's fine to use {@link annotate}.
 */
export function block<Ops extends Operations>(
  invoke: UserBlockFunction<Ops>,
  frame = caller(PARENT)
): UserBlock<Ops> {
  return annotateWithFrame(invoke, frame);
}
