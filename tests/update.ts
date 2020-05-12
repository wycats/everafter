import type {
  SimpleText,
  SimpleComment,
  SimpleNode,
} from "@simple-dom/interface";
import type { ReactiveValue, Updater } from "reactive-prototype";

export class NodeValueUpdate implements Updater {
  #node: SimpleText | SimpleComment;
  #value: ReactiveValue<string>;

  constructor(node: SimpleText | SimpleComment, value: ReactiveValue<string>) {
    this.#node = node;
    this.#value = value;
  }

  poll(): Updater | void {
    let current = this.#value.compute();
    this.#node.nodeValue = current.value;

    if (current.type === "mutable") {
      return this;
    }
  }
}

export class NodeUpdate implements Updater {
  #node: SimpleNode;
  #value: ReactiveValue<SimpleNode>;

  constructor(node: SimpleNode, value: ReactiveValue<SimpleNode>) {
    this.#node = node;
    this.#value = value;
  }

  poll(): Updater | void {
    let newNode = this.#value.compute();
    let node = this.#node;

    let parent = node.parentNode;

    if (parent === null) {
      throw new Error(`invariant: attempted to replace a detached node`);
    }

    let nextSibling = node.nextSibling;
    parent.removeChild(node);

    parent.insertBefore(newNode.value, nextSibling);

    if (newNode.type === "mutable") {
      return this;
    }
  }
}
