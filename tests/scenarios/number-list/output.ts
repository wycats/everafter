import {
  annotate,
  caller,
  CompilableAtom,
  DEBUG,
  DebugFields,
  description,
  Evaluate,
  Host,
  LogLevel,
  Region,
  AppenderForCursor,
  PARENT,
  POLL,
  ReactiveParameter,
  RegionAppender,
  ReactiveRange,
  ReactiveState,
  Var,
  struct,
  Structured,
  Updater,
  Source,
} from "everafter";

export interface NumberArrayOps {
  cursor: ArrayCursor;
  atom: Var<number>;
  defaultAtom: ReactiveParameter<number>;
  block: never;
}

class CompilableDomAtom extends CompilableAtom<NumberArrayOps, Var<number>> {
  #value: ReactiveParameter<number>;
  #source: Source;

  constructor(value: ReactiveParameter<number>, source: Source) {
    super();
    this.#value = value;
    this.#source = source;
  }

  get debugFields(): DebugFields {
    return new DebugFields("CompilableDomAtom", {
      value: this.#value,
      caller: this.#source,
    });
  }

  compile(state: ReactiveState): Evaluate<NumberArrayOps> {
    let value = this.#value.hydrate(state);

    let func = (output: Region<NumberArrayOps>): void => {
      output.atom(value, this.#source);
    };

    return annotate(func, this.#source);
  }
}

export function num(num: ReactiveParameter<number>): CompilableDomAtom {
  return new CompilableDomAtom(num, caller(PARENT));
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
    return struct("ArrayElementUpdate", [
      "pos",
      description(String(this.#cursor.absolutePos)),
    ]);
  }

  [POLL](host: Host): Updater {
    let next = this.#value.compute();
    let current = this.#cursor.current();

    if (next.value === current) {
      host.logResult(LogLevel.Info, "nothing to do");
    } else {
      host.logResult(LogLevel.Info, `replacing ${current} with ${next.value}`);
      this.#cursor.replace(next.value, host);
    }

    return this;
  }
}

export class ArrayCursor {
  static from(array: number[], host: Host, start = 0): ArrayCursor {
    let range = ArrayRange.from(array, host, start);
    return new ArrayCursor(array, range, 0);
  }

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

  get debugFields(): DebugFields {
    return new DebugFields("ArrayCursor", {
      array: this.#array,
      range: this.#range,
      pos: this.#pos,
    });
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

const HEADER_STYLE = "color: #900; font-weight: bold";

// TODO: Since the system manages turning Output into a parent/child stack,
// is this actually necessary or can Output serve the same purpose.
export class ArrayRange implements ReactiveRange<NumberArrayOps> {
  static from(array: number[], host: Host, start = 0): ArrayRange {
    return new ArrayRange(array, null, host, start);
  }

  readonly #array: number[];
  readonly #start: number;
  readonly #parent: ArrayRange | null = null;
  readonly #host: Host;
  #cleared = false;
  #size: number;

  // start is the starting offset relative to the parent block
  // size is the current position relative to the starting offset
  constructor(
    array: number[],
    parent: ArrayRange | null,
    host: Host,
    start = 0,
    size = 0
  ) {
    this.#array = array;
    this.#start = start;
    this.#parent = parent;
    this.#size = size;
    this.#host = host;
  }

  [DEBUG](): Structured {
    return struct(
      "ArrayRange",
      ["start", description(String(this.#start))],
      ["size", description(String(this.#size))]
    );
  }

  get parent(): ArrayRange | null {
    return this.#parent;
  }

  get debugFields(): DebugFields {
    return new DebugFields("ArrayRange", {
      array: this.#array,
      start: this.#start,
      size: this.#size,
      parent: this.#parent,
    });
  }

  get start(): number {
    if (this.#parent) {
      return this.#parent.start + this.#start;
    } else {
      return 0;
    }
  }

  get size(): number {
    return this.#size;
  }

  get cursor(): ArrayCursor {
    return new ArrayCursor(this.#array, this, this.#size);
  }

  begin(): ArrayRange {
    return new ArrayRange(
      this.#array,
      this,
      this.#host,
      this.#start + this.#size
    );
  }

  commit(): ArrayRange {
    if (this.#parent === null) {
      throw new Error(`invariant: can't pop the root range`);
    }

    return this.#parent;
  }

  #increaseSize = (size: number): void => {
    this.#size += size;
    this.#increaseParentSize(size);
  };

  #increaseParentSize = (size: number): void => {
    if (this.#parent) {
      this.#parent.#increaseSize(size);
    }
  };

  #decreaseSize = (size: number): void => {
    this.#size -= size;
    this.#decreaseParentSize(size);
  };

  #decreaseParentSize = (size: number): void => {
    if (this.#parent) {
      this.#parent.#decreaseSize(size);
    }
  };

  append(num: number): ArrayCursor {
    let cursor = this.cursor;
    cursor.insert(num);
    this.#increaseSize(1);
    return cursor;
  }

  private ensureClearable(): ArrayRange {
    if (this.#cleared) {
      throw new Error(`invariant: can only clear a range once`);
    } else {
      this.#cleared = true;
    }

    if (this.#parent === null) {
      throw new Error(`invariant: cannot clear the root range`);
    }

    return this.#parent;
  }

  clear(): ArrayCursor {
    let parent = this.ensureClearable();

    log(this.#host, this.#array, this, () => {
      this.#array.splice(this.start, this.#size);
      this.#decreaseSize(this.#size);
    });

    return new ArrayCursor(this.#array, parent, this.#start);
  }
}

function log(
  host: Host,
  array: number[],
  range: ArrayRange,
  callback: () => void
): void {
  host.log(
    LogLevel.Info,
    `removing ${range.size} from position ${range.start}`
  );

  host.indent(LogLevel.Info, () => {
    host.log(LogLevel.Info, "TREE, BEFORE", HEADER_STYLE);
    logStatus(host, array, range);

    callback();

    host.log(LogLevel.Info, "TREE, AFTER", HEADER_STYLE);
    logStatus(host, array, range);
  });
}

function logStatus(host: Host, array: number[], range: ArrayRange): void {
  host.indent(LogLevel.Info, () => {
    host.log(LogLevel.Info, `array=${JSON.stringify(array)}`);
    host.log(LogLevel.Info, `start=${range.start} size=${range.size}`);

    if (range.parent) {
      const parent = range.parent;

      host.indent(LogLevel.Info, () => {
        host.log(LogLevel.Info, "[parent]");
        logStatus(host, array, parent);
      });
    }
  });
}

export class NumberListOutput implements RegionAppender<NumberArrayOps> {
  static from(array: number[], host: Host): NumberListOutput {
    return new NumberListOutput(ArrayCursor.from(array, host), host);
  }

  #output: number[];
  #range: ArrayRange;
  #host: Host;

  constructor(
    cursor: ArrayCursor,
    host: Host,
    parent: NumberListOutput | null = null
  ) {
    this.#output = cursor.array;
    this.#host = host;

    this.#range = new ArrayRange(
      this.#output,
      parent ? parent.#range : null,
      host,
      cursor.absolutePos
    );
  }

  finalize(): ArrayRange {
    return this.#range;
  }

  getChild(): AppenderForCursor<NumberArrayOps> {
    return cursor => new NumberListOutput(cursor, this.#host, this);
  }

  getCursor(): ArrayCursor {
    return this.#range.cursor;
  }

  atom(num: Var<number>): Updater {
    let cursor = this.#range.append(num.current);

    return new ArrayElementUpdate(cursor, num);
  }
}
