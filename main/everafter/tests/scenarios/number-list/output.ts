import {
  annotate,
  AppendingReactiveRange,
  caller,
  CompilableAtom,
  CompileOperations,
  DEBUG,
  description,
  Evaluate,
  Host,
  LogLevel,
  PARENT,
  ReactiveParameter,
  ReactiveRange,
  ReactiveState,
  Region,
  Source,
  Structured,
  Updater,
  Var,
  initializeEffect,
} from "everafter";

export type ArrayAtom = Var<number>;
export type DefaultArrayAtom = ReactiveParameter<number>;

export class CompileNumberArrayOps
  implements CompileOperations<ArrayCursor, ArrayAtom, DefaultArrayAtom> {
  defaultAtom(atom: DefaultArrayAtom): CompilableNumberAtom {
    return num(atom);
  }
}

class CompilableNumberAtom extends CompilableAtom<ArrayCursor, ArrayAtom> {
  #value: ReactiveParameter<number>;
  #source: Source;

  constructor(value: ReactiveParameter<number>, source: Source) {
    super();
    this.#value = value;
    this.#source = source;
  }

  compile(state: ReactiveState): Evaluate<ArrayCursor, ArrayAtom> {
    let value = this.#value.hydrate(state);

    let func = (output: Region<ArrayCursor, ArrayAtom>): void => {
      output.atom(value, this.#source);
    };

    return annotate(func, this.#source);
  }
}

export function num(num: ReactiveParameter<number>): CompilableNumberAtom {
  return new CompilableNumberAtom(num, caller(PARENT));
}

export interface Block {
  open: void;
  head: never;
}

export class ArrayCursor {
  #array: number[];
  #range: ArrayRange;
  #pos: number;

  constructor(array: number[], range: ArrayRange, pos: number) {
    this.#array = array;
    this.#range = range;
    this.#pos = pos;
  }

  get array(): number[] {
    return this.#array;
  }

  get absolutePos(): number {
    return this.#range.start + this.#pos;
  }

  current(): number {
    return this.#array[this.#pos];
  }

  insert(num: number): void {
    this.#array.splice(this.absolutePos, 0, num);
  }

  replace(num: number, host: Host): void {
    host.logResult(
      LogLevel.Info,
      `replacing ${this.absolutePos} from ${
        this.#array[this.absolutePos]
      } to ${num}`
    );
    this.#array[this.absolutePos] = num;
  }
}

export class ArrayRange
  implements
    ReactiveRange<ArrayCursor, ArrayAtom>,
    AppendingReactiveRange<ArrayCursor, ArrayAtom> {
  static from(array: number[], host: Host): ArrayRange {
    return new ArrayRange(array, 0, array.length, null, host);
  }

  #array: number[];
  #start: number;
  #length: number;
  #parent: ArrayRange | null;
  #host: Host;

  constructor(
    array: number[],
    start: number,
    length: number,
    parent: ArrayRange | null,
    host: Host
  ) {
    this.#array = array;
    this.#start = start;
    this.#length = length;
    this.#parent = parent;
    this.#host = host;
  }

  append(atom: ArrayAtom, source: Source): Updater {
    let cursor: ArrayCursor | undefined = undefined;
    let host = this.#host;

    return initializeEffect(
      {
        initialize: annotate(() => {
          cursor = this.getCursor();
          cursor.insert(atom.current);
          this.#increment(1);
          return cursor;
        }, source),
        update: annotate((cursor: ArrayCursor) => {
          let next = atom.current;
          let current = cursor.current();
          if (next === current) {
            host.logResult(LogLevel.Info, "nothing to do");
          } else {
            host.logResult(LogLevel.Info, `replacing ${current} with ${next}`);
            cursor.replace(next, host);
          }
        }, source),
      },
      host,
      source
    );
  }

  getCursor(): ArrayCursor {
    return new ArrayCursor(this.#array, this, this.#length);
  }

  child(): AppendingReactiveRange<ArrayCursor, ArrayAtom> {
    return new ArrayRange(this.#array, 0, 0, this, this.#host);
  }

  finalize(): ReactiveRange<ArrayCursor, ArrayAtom> {
    return this;
  }

  get start(): number {
    return this.#absoluteStart();
  }

  get size(): number {
    return this.#length;
  }

  get parent(): ArrayRange | null {
    return this.#parent;
  }

  [DEBUG](): Structured {
    return description("ArrayRange");
  }

  #absoluteStart = (): number => {
    if (this.#parent) {
      return this.#parent.#start + this.#start;
    } else {
      return this.#start;
    }
  };

  #decrement = (size: number): void => {
    this.#length -= size;

    if (this.#parent) {
      this.#parent.#decrement(size);
    }
  };

  #increment = (size: number): void => {
    this.#length += size;

    if (this.#parent) {
      this.#parent.#increment(size);
    }
  };

  clears(): ArrayRange {
    this.#array.splice(this.#absoluteStart(), this.#length);
    this.#decrement(this.#length);
    return this;
  }
}
