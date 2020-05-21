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
  struct,
  Structured,
  Updater,
  Var,
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

class ArrayElementUpdate implements Updater {
  #cursor: ArrayCursor;
  #value: Var<number>;

  constructor(cursor: ArrayCursor, value: Var<number>) {
    this.#cursor = cursor;
    this.#value = value;
  }

  [DEBUG](): Structured {
    return struct("ArrayElementUpdate", {
      pos: description(String(this.#cursor.absolutePos)),
    });
  }

  poll(host: Host): "const" | "dynamic" {
    let next = this.#value.compute();
    let current = this.#cursor.current();

    if (next.value === current) {
      host.logResult(LogLevel.Info, "nothing to do");
    } else {
      host.logResult(LogLevel.Info, `replacing ${current} with ${next.value}`);
      this.#cursor.replace(next.value, host);
    }

    return "dynamic";
  }
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
  static from(array: number[]): ArrayRange {
    return new ArrayRange(array, 0, array.length, null);
  }

  #array: number[];
  #start: number;
  #length: number;
  #parent: ArrayRange | null;

  constructor(
    array: number[],
    start: number,
    length: number,
    parent: ArrayRange | null
  ) {
    this.#array = array;
    this.#start = start;
    this.#length = length;
    this.#parent = parent;
  }

  append(atom: ArrayAtom): Updater {
    let cursor = this.getCursor();
    cursor.insert(atom.current);
    this.#increment(1);

    return new ArrayElementUpdate(cursor, atom);
  }

  getCursor(): ArrayCursor {
    return new ArrayCursor(this.#array, this, this.#length);
  }

  child(): AppendingReactiveRange<ArrayCursor, ArrayAtom> {
    return new ArrayRange(this.#array, 0, 0, this);
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

  clear(): ArrayRange {
    this.#array.splice(this.#absoluteStart(), this.#length);
    this.#decrement(this.#length);
    return this;
  }
}
