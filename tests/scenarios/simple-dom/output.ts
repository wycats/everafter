import type {
  AttrNamespace,
  SimpleDocument,
  SimpleDocumentFragment,
  SimpleElement,
  SimpleNode,
} from "@simple-dom/interface";
import {
  AbstractOutput,
  BlockBuffer,
  Cursor,
  CursorRange,
  OutputFactory,
  ReactiveValue,
  Stack,
  unreachable,
  Updater,
} from "reactive-prototype";
import { NodeUpdate, NodeValueUpdate } from "../../update";

type ElementBlock = {
  open: OpenElement;
  head: HeadAttr;
};

type BlockKind = ElementBlock;

interface OpenElement {
  readonly kind: "Element";
  readonly value: ReactiveValue<string>;
}

type DomBlockOpen = OpenElement;

interface HeadAttr {
  readonly kind: "Attr";
  readonly value: {
    readonly name: string;
    readonly value: string;
    readonly ns: AttrNamespace;
  };
}

type DomBlockHead = HeadAttr;

export function element(name: ReactiveValue<string>): OpenElement {
  return {
    kind: "Element",
    value: name,
  };
}

interface InlineText {
  readonly kind: "Text";
  readonly value: ReactiveValue<string>;
}

interface InlineComment {
  readonly kind: "Comment";
  readonly value: ReactiveValue<string>;
}

interface InlineNode {
  readonly kind: "Node";
  readonly value: ReactiveValue<SimpleNode>;
}

type InlineKind = InlineText | InlineComment | InlineNode;

export function text(value: ReactiveValue<string>): InlineText {
  return {
    kind: "Text",
    value,
  };
}

export function comment(value: ReactiveValue<string>): InlineComment {
  return {
    kind: "Comment",
    value,
  };
}

export function node(value: ReactiveValue<SimpleNode>): InlineNode {
  return {
    kind: "Node",
    value,
  };
}

export interface DomCursor extends Cursor {
  readonly parentNode: ParentNode;
  readonly nextSibling: SimpleNode | null;
}

export interface DomOps {
  cursor: DomCursor;
  blockKind: BlockKind;
  leafKind: InlineKind;
}

export type ParentNode = SimpleElement | SimpleDocumentFragment;

export class DomCursor implements Cursor {
  constructor(
    readonly parentNode: ParentNode,
    readonly nextSibling: SimpleNode | null
  ) {}

  insert(node: SimpleNode): void {
    this.parentNode.insertBefore(node, this.nextSibling);
  }
}

export class DomRange implements CursorRange<DomOps> {
  constructor(
    readonly parentNode: ParentNode,
    readonly start: SimpleNode,
    readonly end: SimpleNode
  ) {
    if (start.parentNode !== end.parentNode) {
      throw new Error(
        `assert: a DomRange's start and end must have the same cursor`
      );
    }
  }

  clear(): DomCursor {
    let afterLast = this.end.nextSibling;
    let current: SimpleNode | null = this.start;

    while (current !== null && current !== afterLast) {
      let next: SimpleNode | null = current.nextSibling;
      this.parentNode.removeChild(current);
      current = next;
    }

    return new DomCursor(this.parentNode, afterLast);
  }
}

export class DomElementBuffer implements BlockBuffer<DomOps, ElementBlock> {
  #current: SimpleElement;
  #output: SimpleDomOutput;

  constructor(parent: SimpleElement, output: SimpleDomOutput) {
    this.#current = parent;
    this.#output = output;
  }

  head(head: HeadAttr): void {
    this.#current.setAttribute(head.value.name, head.value.value);
  }
  flush(): void {
    this.#output.flushElement(this.#current);
  }
  close(): void {
    this.#output.closeElement();
  }
}

export class SimpleDomOutput extends AbstractOutput<DomOps> {
  #document: SimpleDocument;
  #stack: Stack<SimpleElement | SimpleDocumentFragment>;

  constructor(
    cursor: DomCursor,
    stack: Stack<SimpleElement | SimpleDocumentFragment> = new Stack(
      cursor.parentNode
    )
  ) {
    super();
    this.#document = cursor.parentNode.ownerDocument;
    this.#stack = stack;
  }

  getCursor(): DomCursor {
    // in principle, working through a current cursor should make this code
    // more amenable to rehydration as a future extension.
    return new DomCursor(this.#stack.current, null);
  }

  flushElement(element: SimpleElement): void {
    this.#stack.push(element);
  }

  closeElement(): void {
    let element = this.#stack.pop();
    this.getCursor().insert(element);
  }

  private getOffset(): number {
    let parent = this.#stack.current;

    return parent.childNodes.length;
  }

  range<T>(callback: () => T): { value: T; range: CursorRange<DomOps> } {
    let startOffset = this.getOffset();
    let startParent = this.getCursor().parentNode;
    let value = callback();
    let endOffset = this.getOffset();
    let endParent = this.getCursor().parentNode;

    if (startParent !== endParent) {
      throw new Error(
        `invariant: the callback to wrap() must push the same number of elements as it pops, leaving the original parent element as the current element on the stack`
      );
    }

    if (startOffset === endOffset) {
      let placeholder = this.#document.createComment("");
      this.getCursor().insert(placeholder);

      return {
        value,
        range: new DomRange(startParent, placeholder, placeholder),
      };
    } else {
      let startNode = startParent.childNodes[startOffset];
      let endNode = startParent.childNodes[endOffset - 1];
      return { value, range: new DomRange(startParent, startNode, endNode) };
    }
  }

  getOutput(): OutputFactory<DomOps> {
    return (cursor: DomCursor) => new SimpleDomOutput(cursor, this.#stack);
  }

  appendLeaf(inline: InlineKind): Updater {
    switch (inline.kind) {
      case "Text": {
        let current = inline.value.compute();
        let node = this.#document.createTextNode(current.value);
        this.getCursor().insert(node);

        return new NodeValueUpdate(node, inline.value);
      }

      case "Comment": {
        let current = inline.value.compute();
        let node = this.#document.createComment(current.value);
        this.getCursor().insert(node);

        return new NodeValueUpdate(node, inline.value);
      }

      case "Node": {
        let current = inline.value.compute();
        let node = current.value;
        this.getCursor().insert(node);

        return new NodeUpdate(node, inline.value);
      }

      default:
        unreachable(inline);
    }
  }

  openBlock(open: DomBlockOpen): DomElementBuffer {
    switch (open.kind) {
      case "Element": {
        let current = open.value.compute();
        let element = this.#document.createElement(current.value);
        return new DomElementBuffer(element, this);
        break;
      }
      default:
        throw new Error(`unexpected open block kind, expected Element`);
    }
  }
}
