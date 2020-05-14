import type {
  AttrNamespace,
  SimpleDocument,
  SimpleDocumentFragment,
  SimpleElement,
  SimpleNode,
} from "@simple-dom/interface";
import {
  AbstractOutput,
  annotateWithFrame,
  BlockBuffer,
  callerFrame,
  CompilableLeaf,
  CompilableOpen,
  Cursor,
  CursorRange,
  DebugFields,
  Evaluate,
  frameSource,
  Output,
  OutputFactory,
  PARENT,
  ReactiveArgument,
  ReactiveState,
  ReactiveValue,
  Stack,
  unreachable,
  Updater,
} from "reactive-prototype";
import type { StackTraceyFrame } from "stacktracey";
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

export class CompilableElement implements CompilableOpen<DomOps, ElementBlock> {
  #name: ReactiveArgument<string>;
  #source: StackTraceyFrame;

  constructor(name: ReactiveArgument<string>, source: StackTraceyFrame) {
    this.#name = name;
    this.#source = source;
  }

  compile(state: ReactiveState): Evaluate<DomOps, OpenElement> {
    let open = runtimeElement(this.#name.hydrate(state));

    return annotateWithFrame((_output: Output<DomOps>) => open, this.#source);
  }
}

export function runtimeElement(name: ReactiveValue<string>): OpenElement {
  return {
    kind: "Element",
    value: name,
  };
}

export function element(
  name: ReactiveArgument<string>
): CompilableOpen<DomOps> {
  let caller = callerFrame(PARENT);
  return new CompilableElement(name, caller);
}

class CompilableDomLeaf<T, L extends DomOps["leafKind"]>
  implements CompilableLeaf<DomOps, L> {
  #value: ReactiveArgument<T>;
  #caller: StackTraceyFrame;
  #toRuntime: (value: ReactiveValue<T>) => (output: Output<DomOps>) => void;

  constructor(
    value: ReactiveArgument<T>,
    caller: StackTraceyFrame,
    toRuntime: (value: ReactiveValue<T>) => (output: Output<DomOps>) => void
  ) {
    this.#value = value;
    this.#caller = caller;
    this.#toRuntime = toRuntime;
  }

  get debugFields(): DebugFields {
    return new DebugFields("CompilableDomLeaf", {
      value: this.#value,
      caller: this.#caller,
    });
  }

  compile(state: ReactiveState): Evaluate<DomOps> {
    let value = this.#value.hydrate(state);
    console.log(frameSource(this.#caller));
    return annotateWithFrame(this.#toRuntime(value), this.#caller);
  }
}

interface InlineText {
  readonly kind: "Text";
  readonly value: ReactiveArgument<string>;
}

class InlineText extends CompilableDomLeaf<string, RuntimeInlineText> {
  toRuntime(value: ReactiveValue<string>): (output: Output<DomOps>) => void {
    return output => output.leaf(runtimeText(value));
  }
}

export function text(
  value: ReactiveArgument<string>
): CompilableDomLeaf<string, RuntimeInlineText> {
  let caller = callerFrame(PARENT);
  return new CompilableDomLeaf(value, caller, value => output =>
    output.leaf(runtimeText(value), caller)
  );
}

interface InlineComment {
  readonly kind: "Comment";
  readonly value: ReactiveArgument<string>;
}

export function comment(
  value: ReactiveArgument<string>
): CompilableDomLeaf<string, RuntimeInlineComment> {
  let caller = callerFrame(PARENT);
  return new CompilableDomLeaf(value, caller, value => output =>
    output.leaf(runtimeComment(value), caller)
  );
}

interface InlineNode {
  readonly kind: "Node";
  readonly value: ReactiveArgument<SimpleNode>;
}

export function node(
  value: ReactiveArgument<SimpleNode>
): CompilableDomLeaf<SimpleNode, RuntimeInlineNode> {
  let caller = callerFrame(PARENT);
  return new CompilableDomLeaf(value, caller, value => output =>
    output.leaf(runtimeNode(value), caller)
  );
}

type InlineKind = InlineText | InlineComment | InlineNode;

interface RuntimeInlineText {
  readonly kind: "Text";
  readonly value: ReactiveValue<string>;
}

interface RuntimeInlineComment {
  readonly kind: "Comment";
  readonly value: ReactiveValue<string>;
}

interface RuntimeInlineNode {
  readonly kind: "Node";
  readonly value: ReactiveValue<SimpleNode>;
}

type RuntimeInlineKind =
  | RuntimeInlineText
  | RuntimeInlineComment
  | RuntimeInlineNode;

export function runtimeText(value: ReactiveValue<string>): RuntimeInlineText {
  return {
    kind: "Text",
    value,
  };
}

// export function text(value: ReactiveArgument<string>):

export function runtimeComment(
  value: ReactiveValue<string>
): RuntimeInlineComment {
  return {
    kind: "Comment",
    value,
  };
}

export function runtimeNode(
  value: ReactiveValue<SimpleNode>
): RuntimeInlineNode {
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
  leafKind: RuntimeInlineKind;
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

  appendLeaf(inline: RuntimeInlineKind): Updater {
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
