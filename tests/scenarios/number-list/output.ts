import {
  AbstractOutput,
  BlockBuffer,
  CursorRange,
  DebugFields,
  OutputFactory,
  ReactiveValue,
  Updater,
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

  poll(): Updater {
    let current = this.#value.compute();
    this.#cursor.replace(current.value);
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
  static from(array: number[], start = 0): ArrayCursor {
    let range = ArrayRange.from(array, start);
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

  insert(num: number): void {
    this.#array.splice(this.absolutePos, 0, num);
  }

  replace(num: number): void {
    this.#array[this.absolutePos] = num;
  }
}

export class ArrayRange implements CursorRange<NumberArrayOps> {
  static from(array: number[], start = 0): ArrayRange {
    return new ArrayRange(array, null, start);
  }

  #array: number[];
  #start: number;
  #size: number;
  #parent: ArrayRange | null = null;
  #cleared = false;

  // start is the starting offset relative to the parent block
  // size is the current position relative to the starting offset
  constructor(array: number[], parent: ArrayRange | null, start = 0, size = 0) {
    this.#array = array;
    this.#start = start;
    this.#parent = parent;
    this.#size = size;
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
    return new ArrayRange(this.#array, this, this.#start + this.#size);
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

  private debug(depth = 0): void {
    console.log("array = ", this.#array);
    console.log("start = ", this.start, "size = ", this.#size);

    if (this.#parent) {
      console.log("-> parent", depth + 1);
      this.#parent.debug(depth + 1);
    }
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

    console.log("removing", this.#size, "from position", this.start);

    console.log("TREE, BEFORE");
    this.debug();

    this.#array.splice(this.start, this.#size);

    this.#decreaseSize(this.#size);
    console.log("TREE, AFTER");
    this.debug();
    return new ArrayCursor(this.#array, this.#parent, this.#start);
  }
}

export class NumberListOutput extends AbstractOutput<NumberArrayOps> {
  #output: number[];
  #range: ArrayRange;

  constructor(
    output: number[],
    cursor: ArrayCursor,
    parent: NumberListOutput | null = null
  ) {
    super();
    this.#output = output;

    this.#range = new ArrayRange(
      this.#output,
      parent ? parent.#range : null,
      cursor.absolutePos
    );
  }

  get current(): number[] {
    return this.#output.slice();
  }

  range<T>(callback: () => T): { value: T; range: ArrayRange } {
    let result = callback();
    return { value: result, range: this.#range };
  }

  getOutput(): OutputFactory<NumberArrayOps> {
    return cursor => new NumberListOutput(this.#output, cursor, this);
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
