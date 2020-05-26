import {
  AppendingReactiveRange,
  CompilableAtom,
  CompileOperations,
  DEBUG,
  description,
  Evaluate,
  Factory,
  getOwner,
  initializeEffect,
  LogLevel,
  Owned,
  Owner,
  ReactiveParameter,
  ReactiveRange,
  ReactiveState,
  Region,
  Structured,
  Updater,
  Var,
} from "everafter";

export type ArrayAtom = Var<number>;
export type DefaultArrayAtom = ReactiveParameter<number>;

export class CompileNumberArrayOps
  implements CompileOperations<ArrayCursor, ArrayAtom, DefaultArrayAtom> {
  defaultAtom(atom: DefaultArrayAtom): Factory<CompilableNumberAtom> {
    return num(atom);
  }
}

class CompilableNumberAtom extends CompilableAtom<ArrayCursor, ArrayAtom> {
  #value: ReactiveParameter<number>;

  constructor(owner: Owner, value: ReactiveParameter<number>) {
    super(owner);
    this.#value = value;
  }

  compile(state: ReactiveState): Evaluate<ArrayCursor, ArrayAtom> {
    let value = this.#value.hydrate(state);

    return (output: Region<ArrayCursor, ArrayAtom>): void => {
      output.atom(value);
    };
  }
}

export function num(
  num: ReactiveParameter<number>
): Factory<CompilableNumberAtom> {
  return owner => owner.new(CompilableNumberAtom, num);
}

export interface Block {
  open: void;
  head: never;
}

export class ArrayCursor extends Owned {
  #array: number[];
  #range: ArrayRange;
  #pos: number;

  constructor(owner: Owner, array: number[], range: ArrayRange, pos: number) {
    super(owner);
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

  replace(num: number): void {
    getOwner(this).host.logResult(
      LogLevel.Info,
      `replacing ${this.absolutePos} from ${
        this.#array[this.absolutePos]
      } to ${num}`
    );
    this.#array[this.absolutePos] = num;
  }
}

export class ArrayRange extends Owned
  implements
    ReactiveRange<ArrayCursor, ArrayAtom>,
    AppendingReactiveRange<ArrayCursor, ArrayAtom> {
  static from(owner: Owner, array: number[]): ArrayRange {
    return owner.new(ArrayRange, array, 0, array.length, null);
  }

  #array: number[];
  #start: number;
  #length: number;
  #parent: ArrayRange | null;

  constructor(
    owner: Owner,
    array: number[],
    start: number,
    length: number,
    parent: ArrayRange | null
  ) {
    super(owner);
    this.#array = array;
    this.#start = start;
    this.#length = length;
    this.#parent = parent;
  }

  append(atom: ArrayAtom): Updater {
    let cursor: ArrayCursor | undefined = undefined;
    let owner = getOwner(this);
    let host = owner.host;

    return owner.instantiate(initializeEffect, {
      initialize: () => {
        cursor = this.getCursor();
        cursor.insert(atom.current);
        this.#increment(1);
        return cursor;
      },
      update: (cursor: ArrayCursor) => {
        let next = atom.current;
        let current = cursor.current();
        if (next === current) {
          host.logResult(LogLevel.Info, "nothing to do");
        } else {
          host.logResult(LogLevel.Info, `replacing ${current} with ${next}`);
          cursor.replace(next);
        }
      },
    });
  }

  getCursor(): ArrayCursor {
    return this.new(ArrayCursor, this.#array, this, this.#length);
  }

  child(): AppendingReactiveRange<ArrayCursor, ArrayAtom> {
    return this.new(ArrayRange, this.#array, 0, 0, this);
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
