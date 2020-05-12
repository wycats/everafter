import { unwrap } from "./utils";

export class Stack<T> {
  #stack: [T, ...T[]];

  constructor(initial: T) {
    this.#stack = [initial];
  }

  push(value: T): void {
    this.#stack.push(value);
  }

  pop(): T {
    if (this.#stack.length === 0) {
      throw new Error(`invariant: can't pop an empty Stack`);
    } else if (this.#stack.length === 1) {
      throw new Error(`invariant: can't pop the last element of a Stack`);
    }

    return unwrap(this.#stack.pop());
  }

  get current(): T {
    if (this.#stack.length === 0) {
      throw new Error(`invariant: a Stack cannot become empty`);
    }

    return this.#stack[this.#stack.length - 1];
  }
}
