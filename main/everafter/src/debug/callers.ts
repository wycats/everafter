import StackTracey, { StackTraceyFrame } from "stacktracey";
import { DEBUG, Debuggable } from "./debuggable";
import { description, Structured, newtype } from "./structured";

export const SOURCE_STACK: Source[] = [];

export function sourceFrame<T>(
  callback: () => T,
  source: Source | null = caller(PARENT)
): T {
  if (source === null) {
    return callback();
  } else {
    SOURCE_STACK.push(source);
    let result = callback();
    SOURCE_STACK.pop();
    return result;
  }
}

export function getSourceFrame(): Source {
  if (SOURCE_STACK.length > 0) {
    return SOURCE_STACK[SOURCE_STACK.length - 1];
  } else {
    return NO_SOURCE;
  }
}

export interface Source extends Debuggable {
  desc: string | null;
  withDefaultDescription(description: string): Source;
  describe(description: string): Source;
  description: string;
  or(source: Source): Source;
}

export class NoSource implements Source, Debuggable {
  #desc: string | null;

  constructor(desc?: string) {
    this.#desc = desc || null;
  }

  get desc(): string | null {
    return this.#desc;
  }

  or(source: Source): Source {
    return source;
  }

  withDefaultDescription(description: string): Source {
    if (this.#desc) {
      return this;
    } else {
      return this.describe(description);
    }
  }

  describe(description: string): Source {
    return new NoSource(description);
  }

  get description(): string {
    return `unknown source`;
  }

  [DEBUG](): Structured {
    if (this.#desc) {
      return description(`${this.#desc} at ${this.description}`);
    } else {
      return description(this.description);
    }
  }
}

export const NO_SOURCE = new NoSource();

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

  or(_source: Source): Source {
    return this;
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

const SOURCED = new WeakMap<object, Source>();

export function f<F extends Function>(
  func: F,
  source: Source = caller(PARENT)
): F {
  SOURCED.set(func, source);
  return func;
}

export function setDefaultSource<O extends object>(
  o: O,
  defaultSource: Source | void
): O {
  if (!SOURCED.has(o) && defaultSource) {
    SOURCED.set(o, defaultSource);
    return o;
  }

  if (defaultSource) {
    let source = SOURCED.get(o);
    if (source) {
      SOURCED.set(o, source.or(defaultSource));
    } else {
      SOURCED.set(o, defaultSource);
    }
  }

  return o;
}

export function getSourceHere(f: object, defaultSource?: Source): Source {
  return getSource(f, getSourceFrame() || defaultSource);
}

export function getSource(f: object, defaultSource?: Source): Source {
  return maybeGetSource(f, defaultSource) || NO_SOURCE;
}

export function maybeGetSource(
  f: object,
  defaultSource?: Source
): Source | void {
  if (f instanceof SourceImpl) {
    return f;
  }
  let source = SOURCED.get(f);

  if (source === NO_SOURCE || source === undefined) {
    return defaultSource;
  } else {
    return source;
  }
}
