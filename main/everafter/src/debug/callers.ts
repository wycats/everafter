import StackTracey, { StackTraceyFrame } from "stacktracey";
import { DEBUG, Debuggable } from "./debuggable";
import { description, Structured } from "./structured";

export const SOURCE_STACK: Source[] = [];

export function sourceFrame<T>(
  callback: () => T,
  source: Source = caller(PARENT)
): T {
  SOURCE_STACK.push(source);
  let result = callback();
  SOURCE_STACK.pop();
  return result;
}

export function getSourceFrame(): Source | void {
  if (SOURCE_STACK.length > 0) {
    return SOURCE_STACK[SOURCE_STACK.length - 1];
  }
}

export interface Source extends Debuggable {
  desc: string | null;
  withDefaultDescription(description: string): Source;
  describe(description: string): Source;
  description: string;
}

export class SourceImpl implements Source, Debuggable {
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
    return new SourceImpl(this.#frame, description);
  }

  get description(): string {
    let file = this.#frame.file;
    file = file.replace(/^webpack:\/\/\/(tests|src)/, "webpack:///./$1");
    return `${file}:${this.#frame.line}:${this.#frame.column}`;
  }
}

export function source(frame: StackTraceyFrame, desc?: string): Source {
  return new SourceImpl(frame, desc);
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
  return new SourceImpl(trace.withSource(depth), desc);
}
