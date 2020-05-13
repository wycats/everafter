import {
  AbstractOutput,
  BlockBuffer,
  CursorRange,
  DebugFields,
  OutputFactory,
  ReactiveValue,
  Updater,
  DEBUG,
  POLL,
  Host,
  LogLevel,
  Structured,
  struct,
  description,
} from "reactive-prototype";

export interface NumberArrayOps {
  cursor: ArrayCursor;
  leafKind: ReactiveValue<number>;
  blockKind: {
    open: void;
    head: never;
  };
}

export interface Block {
  open: void;
  head: never;
}

class ArrayElementUpdate implements Updater {
  #cursor: ArrayCursor;
  #value: ReactiveValue<number>;

  constructor(cursor: ArrayCursor, value: ReactiveValue<number>) {
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
    }

    debugger;
    this.#cursor.replace(next.value);
    return this;
  }
}

class ArrayElementBuffer
  implements BlockBuffer<NumberArrayOps, NumberArrayOps["blockKind"]> {
  #buffer: number[] = [];
  #output: NumberListOutput;
  #cursor: ArrayCursor;

  constructor(output: NumberListOutput, cursor: ArrayCursor) {
    this.#output = output;
    this.#cursor = cursor;
  }

  push(num: ReactiveValue<number>): void {
    this.#output.appendLeaf(num);
  }

  head(_head: void): void {
    return;
  }
  flush(): void {
    return;
  }
  close(): void {
    return;
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

  replace(num: number): void {
    console.log(
      "replacing",
      this.absolutePos,
      "from",
      this.#array[this.absolutePos],
      "to",
      num
    );
    this.#array[this.absolutePos] = num;
  }
}

const HEADER_STYLE = "color: #900; font-weight: bold";

export class ArrayRange implements CursorRange<NumberArrayOps> {
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

  private logStatus(): void {
    this.#host.indent(LogLevel.Info, () => {
      this.#host.log(LogLevel.Info, `array=${JSON.stringify(this.#array)}`);
      this.#host.log(LogLevel.Info, `start=${this.start} size=${this.#size}`);

      if (this.#parent) {
        // TS FRICTION: this shouldn't be necessay, since #parent is readonly
        const parent = this.#parent;

        this.#host.indent(LogLevel.Info, () => {
          this.#host.log(LogLevel.Info, "[parent]");
          parent.logStatus();
        });
      }
    });
  }

  clear(): ArrayCursor {
    if (this.#parent === null) {
      throw new Error(`invariant: cannot clear the root range`);
    }

    if (this.#cleared) {
      throw new Error(`invariant: can only clear a range once`);
    } else {
      this.#cleared = true;
    }

    this.#host.log(
      LogLevel.Info,
      `removing ${this.#size} from position ${this.start}`
    );

    this.#host.indent(LogLevel.Info, () => {
      this.#host.log(LogLevel.Info, "TREE, BEFORE", HEADER_STYLE);
      this.logStatus();

      this.#array.splice(this.start, this.#size);

      this.#decreaseSize(this.#size);
      this.#host.log(LogLevel.Info, "TREE, AFTER", HEADER_STYLE);
      this.logStatus();
    });

    return new ArrayCursor(this.#array, this.#parent, this.#start);
  }
}

export class NumberListOutput extends AbstractOutput<NumberArrayOps> {
  static from(array: number[], host: Host): NumberListOutput {
    return new NumberListOutput(array, ArrayCursor.from(array, host), host);
  }

  #output: number[];
  #range: ArrayRange;
  #host: Host;

  constructor(
    output: number[],
    cursor: ArrayCursor,
    host: Host,
    parent: NumberListOutput | null = null
  ) {
    super();
    this.#output = output;
    this.#host = host;

    this.#range = new ArrayRange(
      this.#output,
      parent ? parent.#range : null,
      host,
      cursor.absolutePos
    );
  }

  range<T>(callback: () => T): { value: T; range: ArrayRange } {
    let result = callback();
    return { value: result, range: this.#range };
  }

  getOutput(): OutputFactory<NumberArrayOps> {
    return cursor =>
      new NumberListOutput(this.#output, cursor, this.#host, this);
  }

  getCursor(): ArrayCursor {
    return this.#range.cursor;
  }

  appendLeaf(num: ReactiveValue<number>): Updater {
    let cursor = this.#range.append(num.value);

    return new ArrayElementUpdate(cursor, num);
  }

  openBlock(): BlockBuffer<NumberArrayOps, Block> {
    return new ArrayElementBuffer(this, this.#range.cursor);
  }
}
