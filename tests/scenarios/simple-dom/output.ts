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
  caller,
  CompilableAtom,
  CompilableOpen,
  DEBUG,
  DebugFields,
  description,
  Evaluate,
  Operations,
  Region,
  AppenderForCursor,
  PARENT,
  ReactiveArgument,
  RegionAppender,
  ReactiveRange,
  ReactiveState,
  Var,
  Stack,
  Structured,
  unreachable,
  Updater,
  CompilableHead,
  Source,
} from "reactive-prototype";
import { NodeUpdate, NodeValueUpdate, AttributeUpdate } from "./update";

type ElementBlock = {
  open: OpenElement;
  head: HeadDomAttr;
};

type BlockKind = ElementBlock;

interface OpenElement {
  readonly kind: "Element";
  readonly value: Var<string>;
}

type DomBlockOpen = OpenElement;

export class CompilableAttr implements CompilableHead<DomOps, ElementBlock> {
  #name: ReactiveArgument<string>;
  #value: ReactiveArgument<string>;
  #namespace: ReactiveArgument<AttrNamespace> | null;
  #source: Source;

  constructor(
    name: ReactiveArgument<string>,
    value: ReactiveArgument<string>,
    namespace: ReactiveArgument<AttrNamespace> | null,
    source: Source
  ) {
    this.#name = name;
    this.#value = value;
    this.#namespace = namespace;
    this.#source = source;
  }

  compile(state: ReactiveState): Evaluate<DomOps, HeadDomAttr> {
    let name = this.#name.hydrate(state);
    let value = this.#value.hydrate(state);
    let namespace = this.#namespace ? this.#namespace.hydrate(state) : null;

    return annotate(_region => runtimeAttr(name, value, namespace));
  }
}

export function attr(
  name: ReactiveArgument<string>,
  value: ReactiveArgument<string>,
  namespace?: ReactiveArgument<AttrNamespace>
): CompilableAttr {
  return new CompilableAttr(name, value, namespace || null, caller(PARENT));
}

export interface DomAttr {
  readonly name: Var<string>;
  readonly value: Var<string>;
  readonly ns: Var<AttrNamespace> | null;
}

export interface HeadDomAttr {
  readonly kind: "Attr";
  readonly value: DomAttr;
}

function runtimeAttr(
  name: Var<string>,
  value: Var<string>,
  ns: Var<AttrNamespace> | null
): HeadDomAttr {
  return {
    kind: "Attr",
    value: {
      name,
      value,
      ns,
    },
  };
}

export class CompilableElement implements CompilableOpen<DomOps, ElementBlock> {
  #name: ReactiveArgument<string>;
  #source: Source;

  constructor(name: ReactiveArgument<string>, source: Source) {
    this.#name = name;
    this.#source = source;
  }

  compile(state: ReactiveState): Evaluate<DomOps, OpenElement> {
    let open = runtimeElement(this.#name.hydrate(state));

    return annotate((_output: Region<DomOps>) => open, this.#source);
  }
}

export function runtimeElement(name: Var<string>): OpenElement {
  return {
    kind: "Element",
    value: name,
  };
}

export function element(
  name: ReactiveArgument<string>
): CompilableOpen<DomOps> {
  return new CompilableElement(name, caller(PARENT));
}

class CompilableDomAtom<T, L extends DomOps["atom"]>
  implements CompilableAtom<DomOps, L> {
  #value: ReactiveArgument<T>;
  #source: Source;
  #toRuntime: (value: Var<T>) => (output: Region<DomOps>) => void;

  constructor(
    value: ReactiveArgument<T>,
    source: Source,
    toRuntime: (value: Var<T>) => (output: Region<DomOps>) => void
  ) {
    this.#value = value;
    this.#source = source;
    this.#toRuntime = toRuntime;
  }

  get debugFields(): DebugFields {
    return new DebugFields("CompilableDomAtom", {
      value: this.#value,
      caller: this.#source,
      toRuntime: this.#toRuntime,
    });
  }

  compile(state: ReactiveState): Evaluate<DomOps> {
    let value = this.#value.hydrate(state);
    return annotate(this.#toRuntime(value), this.#source);
  }
}

export function text(
  value: ReactiveArgument<string>
): CompilableDomAtom<string, RuntimeInlineText> {
  let source = caller(PARENT);
  return new CompilableDomAtom(value, source, value => output =>
    output.atom(runtimeText(value), source)
  );
}

interface InlineComment {
  readonly kind: "Comment";
  readonly value: ReactiveArgument<string>;
}

export function comment(
  value: ReactiveArgument<string>
): CompilableDomAtom<string, RuntimeInlineComment> {
  let source = caller(PARENT);
  return new CompilableDomAtom(value, source, value => output =>
    output.atom(runtimeComment(value), source)
  );
}

interface InlineNode {
  readonly kind: "Node";
  readonly value: ReactiveArgument<SimpleNode>;
}

export function node(
  value: ReactiveArgument<SimpleNode>
): CompilableDomAtom<SimpleNode, RuntimeInlineNode> {
  let source = caller(PARENT);
  return new CompilableDomAtom(value, source, value => output =>
    output.atom(runtimeNode(value), source)
  );
}

interface RuntimeInlineText {
  readonly kind: "Text";
  readonly data: Var<string>;
}

interface RuntimeInlineComment {
  readonly kind: "Comment";
  readonly data: Var<string>;
}

interface RuntimeInlineNode {
  readonly kind: "Node";
  readonly node: Var<SimpleNode>;
}

type RuntimeInlineKind =
  | RuntimeInlineText
  | RuntimeInlineComment
  | RuntimeInlineNode;

export function runtimeText(value: Var<string>): RuntimeInlineText {
  return {
    kind: "Text",
    data: value,
  };
}

export function runtimeComment(value: Var<string>): RuntimeInlineComment {
  return {
    kind: "Comment",
    data: value,
  };
}

export function runtimeNode(value: Var<SimpleNode>): RuntimeInlineNode {
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

  head({ value: attr }: HeadDomAttr): Updater {
    this.#current.setAttribute(attr.name.current, attr.value.current);

    return new AttributeUpdate(this.#current, attr);
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

  getChild(): AppenderForCursor<DomOps> {
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
        let node = this.#document.createComment(inline.data.current);
        this.insert(node);
        this.getCursor().insert(node);

        return new NodeValueUpdate(node, inline.data);
      }

      case "Node": {
        let node = inline.node.current;
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
