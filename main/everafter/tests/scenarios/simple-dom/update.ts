import type {
  SimpleComment,
  SimpleElement,
  SimpleNode,
  SimpleText,
} from "@simple-dom/interface";
import HTMLSerializer from "@simple-dom/serializer";
import voidMap from "@simple-dom/void-map";
import {
  DEBUG,
  description,
  nullable,
  struct,
  Structured,
  Updater,
  Var,
} from "everafter";
import type { DomAttr } from "./output";

export class AttributeUpdate implements Updater {
  #element: SimpleElement;
  #attr: DomAttr;

  constructor(element: SimpleElement, attr: DomAttr) {
    this.#element = element;
    this.#attr = attr;
  }

  [DEBUG](): Structured {
    return struct("AttributeUpdate", {
      element: description(this.#element.tagName.toLowerCase()),
      attr: struct("Attr", {
        name: this.#attr.name,
        value: this.#attr.value,
        namespace: nullable(this.#attr.ns),
      }),
    });
  }

  poll(): "const" | "dynamic" {
    if (this.#attr.ns) {
      this.#element.setAttributeNS(
        this.#attr.ns.current,
        this.#attr.name.current,
        this.#attr.value.current
      );
    } else {
      this.#element.setAttribute(
        this.#attr.name.current,
        this.#attr.value.current
      );
    }

    return "dynamic";
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
    return struct("NodeValueUpdate", {
      value: description(this.#node.nodeValue),
    });
  }

  poll(): "const" | "dynamic" {
    let current = this.#value.compute();
    this.#node.nodeValue = current.value;

    return current.type;
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
    return struct("NodeUpdate", {
      node: description(new HTMLSerializer(voidMap).serialize(this.#node)),
    });
  }

  poll(): "const" | "dynamic" {
    let newNode = this.#value.compute();
    let node = this.#node;

    let parent = node.parentNode;

    if (parent === null) {
      throw new Error(`invariant: attempted to replace a detached node`);
    }

    let nextSibling = node.nextSibling;
    parent.removeChild(node);

    parent.insertBefore(newNode.value, nextSibling);

    return newNode.type;
  }
}
