import type {
  SimpleText,
  SimpleComment,
  SimpleNode,
  SimpleElement,
} from "@simple-dom/interface";
import {
  Var,
  Updater,
  DEBUG,
  POLL,
  Structured,
  struct,
  description,
  DebugFields,
  nullable,
} from "reactive-prototype";
import HTMLSerializer from "@simple-dom/serializer";
import voidMap from "@simple-dom/void-map";
import type { DomAttr } from "./output";

export class AttributeUpdate implements Updater {
  #element: SimpleElement;
  #attr: DomAttr;

  constructor(element: SimpleElement, attr: DomAttr) {
    this.#element = element;
    this.#attr = attr;
  }

  get debugFields(): DebugFields {
    return new DebugFields("AttributeUpdate", {
      element: this.#element,
      attr: this.#attr,
    });
  }

  [DEBUG](): Structured {
    return struct(
      "AttributeUpdate",
      ["element", description(this.#element.tagName.toLowerCase())],
      [
        "attr",
        struct(
          "Attr",
          ["name", this.#attr.name],
          ["value", this.#attr.value],
          ["namespace", nullable(this.#attr.ns)]
        ),
      ]
    );
  }

  [POLL](): void | Updater {
    this.#element.setAttribute(
      this.#attr.name.current,
      this.#attr.value.current
    );

    return this;
  }
}

export class NodeValueUpdate implements Updater {
  #node: SimpleText | SimpleComment;
  #value: Var<string>;

  constructor(node: SimpleText | SimpleComment, value: Var<string>) {
    this.#node = node;
    this.#value = value;
  }

  [DEBUG](): Structured {
    return struct("NodeValueUpdate", [
      "value",
      description(this.#node.nodeValue),
    ]);
  }

  [POLL](): Updater | void {
    let current = this.#value.compute();
    this.#node.nodeValue = current.value;

    if (current.type === "mutable") {
      return this;
    }
  }
}

export class NodeUpdate implements Updater {
  #node: SimpleNode;
  #value: Var<SimpleNode>;

  constructor(node: SimpleNode, value: Var<SimpleNode>) {
    this.#node = node;
    this.#value = value;
  }

  [DEBUG](): Structured {
    return struct("NodeUpdate", [
      "node",
      description(new HTMLSerializer(voidMap).serialize(this.#node)),
    ]);
  }

  [POLL](): Updater | void {
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
