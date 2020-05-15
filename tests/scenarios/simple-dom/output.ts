import type {
  AttrNamespace,
  SimpleDocument,
  SimpleDocumentFragment,
  SimpleElement,
  SimpleNode,
} from "@simple-dom/interface";
import {
  annotate,
  BlockBuffer,
  callerFrame,
  CompilableLeaf,
  CompilableOpen,
  DEBUG,
  DebugFields,
  description,
  Evaluate,
  Operations,
  Output,
  OutputFactory,
  PARENT,
  ReactiveArgument,
  RegionAppender,
  ReactiveRange,
  ReactiveState,
  ReactiveValue,
  Stack,
  Structured,
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

    return annotate((_output: Output<DomOps>) => open, this.#source);
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

class CompilableDomLeaf<T, L extends DomOps["atom"]>
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
      toRuntime: this.#toRuntime,
    });
  }

  compile(state: ReactiveState): Evaluate<DomOps> {
    let value = this.#value.hydrate(state);
    return annotate(this.#toRuntime(value), this.#caller);
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
  readonly data: ReactiveValue<string>;
}

interface RuntimeInlineComment {
  readonly kind: "Comment";
  readonly data: ReactiveValue<string>;
}

interface RuntimeInlineNode {
  readonly kind: "Node";
  readonly node: ReactiveValue<SimpleNode>;
}

type RuntimeInlineKind =
  | RuntimeInlineText
  | RuntimeInlineComment
  | RuntimeInlineNode;

export function runtimeText(value: ReactiveValue<string>): RuntimeInlineText {
  return {
    kind: "Text",
    data: value,
  };
}

// export function text(value: ReactiveArgument<string>):

export function runtimeComment(
  value: ReactiveValue<string>
): RuntimeInlineComment {
  return {
    kind: "Comment",
    data: value,
  };
}

export function runtimeNode(
  value: ReactiveValue<SimpleNode>
): RuntimeInlineNode {
  return {
    kind: "Node",
    node: value,
  };
}

export interface DomOps extends Operations {
  cursor: DomCursor;
  atom: RuntimeInlineKind;
  block: BlockKind;
}

export type ParentNode = SimpleElement | SimpleDocumentFragment;

export class DomCursor {
  constructor(
    readonly parentNode: ParentNode,
    readonly nextSibling: SimpleNode | null
  ) {}

  insert(node: SimpleNode): void {
    this.parentNode.insertBefore(node, this.nextSibling);
  }
}

export class DomRange implements ReactiveRange<DomOps> {
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

  [DEBUG](): Structured {
    return description("DomRange");
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

export class AppendingRange {
  #start: SimpleNode | null = null;
  #end: SimpleNode | null = null;

  appended(node: SimpleNode): void {
    this.#end = node;

    if (this.#start === null) {
      this.#start = node;
    }
  }

  finalize(cursor: DomCursor): DomRange {
    let doc = cursor.parentNode.ownerDocument;

    if (this.#start === null || this.#end === null) {
      let comment = doc.createComment("");
      cursor.insert(comment);
      this.appended(comment);

      return new DomRange(cursor.parentNode, comment, comment);
    } else {
      return new DomRange(cursor.parentNode, this.#start, this.#end);
    }
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

export class SimpleDomOutput implements RegionAppender<DomOps> {
  #document: SimpleDocument;
  #stack: Stack<ParentNode>;
  #range = new AppendingRange();

  constructor(
    cursor: DomCursor,
    stack: Stack<SimpleElement | SimpleDocumentFragment> = new Stack(
      cursor.parentNode
    )
  ) {
    this.#document = cursor.parentNode.ownerDocument;
    this.#stack = stack;
  }

  finalize(): ReactiveRange<DomOps> {
    return this.#range.finalize(this.getCursor());
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
    this.insert(element);
  }

  private insert(node: SimpleNode): void {
    this.getCursor().insert(node);
    this.#range.appended(node);
  }

  getChild(): OutputFactory<DomOps> {
    return (cursor: DomCursor) => new SimpleDomOutput(cursor, this.#stack);
  }

  atom(inline: RuntimeInlineKind): Updater {
    switch (inline.kind) {
      case "Text": {
        let current = inline.data.compute();
        let node = this.#document.createTextNode(current.value);
        this.insert(node);

        return new NodeValueUpdate(node, inline.data);
      }

      case "Comment": {
        let node = this.#document.createComment(inline.data.value);
        this.insert(node);
        this.getCursor().insert(node);

        return new NodeValueUpdate(node, inline.data);
      }

      case "Node": {
        let node = inline.node.value;
        this.getCursor().insert(node);

        return new NodeUpdate(node, inline.node);
      }

      default:
        unreachable(inline);
    }
  }

  open(open: DomBlockOpen): DomElementBuffer {
    switch (open.kind) {
      case "Element": {
        let current = open.value.compute();
        let element = this.#document.createElement(current.value);
        return new DomElementBuffer(element, this);
      }
      default:
        throw new Error(`unexpected open block kind, expected Element`);
    }
  }
}
