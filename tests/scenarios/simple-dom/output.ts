import type {
  AttrNamespace,
  SimpleDocument,
  SimpleDocumentFragment,
  SimpleElement,
  SimpleNode,
} from "@simple-dom/interface";
import {
  annotate,
  AppenderForCursor,
  caller,
  CompilableAtom,
  DEBUG,
  DebugFields,
  description,
  Evaluate,
  Operations,
  PARENT,
  ReactiveParameter,
  ReactiveRange,
  ReactiveState,
  Region,
  RegionAppender,
  Source,
  Stack,
  Structured,
  unreachable,
  Updater,
  Var,
  CursorAdapter,
  StaticReactiveRange,
} from "everafter";
import { NodeUpdate, NodeValueUpdate, AttributeUpdate } from "./update";

export class DomOps implements Operations<DomCursor, DomAtom, Var<string>> {
  appender(cursor: DomCursor): RegionAppender<DomCursor, DomAtom> {
    return new SimpleDomOutput(cursor);
  }

  defaultAtom(atom: Var<string>): DomAtom {
    return runtimeText(atom);
  }
}

interface OpenElement {
  readonly kind: "Element";
  readonly value: Var<string>;
}

export class CompilableAttr implements CompilableAtom<AttrCursor, AttrAtom> {
  #name: ReactiveParameter<string>;
  #value: ReactiveParameter<string>;
  #namespace: ReactiveParameter<AttrNamespace> | null;
  #source: Source;

  constructor(
    name: ReactiveParameter<string>,
    value: ReactiveParameter<string>,
    namespace: ReactiveParameter<AttrNamespace> | null,
    source: Source
  ) {
    this.#name = name;
    this.#value = value;
    this.#namespace = namespace;
    this.#source = source;
  }

  compile(state: ReactiveState): Evaluate<AttrCursor, AttrAtom> {
    let name = this.#name.hydrate(state);
    let value = this.#value.hydrate(state);
    let ns = this.#namespace ? this.#namespace.hydrate(state) : null;

    return annotate(region => region.atom({ name, value, ns }), this.#source);
  }
}

export function attr(
  name: ReactiveParameter<string>,
  value: ReactiveParameter<string>,
  namespace?: ReactiveParameter<AttrNamespace>
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

export function runtimeElement(name: Var<string>): OpenElement {
  return {
    kind: "Element",
    value: name,
  };
}

export function element(
  tagName: string
): CursorAdapter<DomCursor, DomAtom, AttrCursor, AttrAtom> {
  return {
    child(cursor: DomCursor): SimpleAttrOutput {
      let element = cursor.parentNode.ownerDocument.createElement(tagName);
      return new SimpleAttrOutput(element);
    },

    flush(
      parent: DomCursor,
      child: SimpleElement
    ): RegionAppender<DomCursor, DomAtom> {
      parent.insert(child);
      return new SimpleDomOutput(new DomCursor(child, null));
    },
  };
}

class CompilableDomAtom<T, A extends DomAtom> extends CompilableAtom<
  DomCursor,
  A
> {
  #value: ReactiveParameter<T>;
  #source: Source;
  #toRuntime: (value: Var<T>) => (output: Region<DomCursor, DomAtom>) => void;

  constructor(
    value: ReactiveParameter<T>,
    source: Source,
    toRuntime: (value: Var<T>) => (output: Region<DomCursor, DomAtom>) => void
  ) {
    super();

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

  compile(state: ReactiveState): Evaluate<DomCursor, DomAttr> {
    let value = this.#value.hydrate(state);
    return annotate(this.#toRuntime(value), this.#source);
  }
}

export function text(
  value: ReactiveParameter<string>
): CompilableDomAtom<string, TextAtom> {
  let source = caller(PARENT);
  return new CompilableDomAtom(value, source, value => output =>
    output.atom(runtimeText(value), source)
  );
}

export function comment(
  value: ReactiveParameter<string>
): CompilableDomAtom<string, CommentAtom> {
  let source = caller(PARENT);
  return new CompilableDomAtom(value, source, value => output =>
    output.atom(runtimeComment(value), source)
  );
}

export function node(
  value: ReactiveParameter<SimpleNode>
): CompilableDomAtom<SimpleNode, NodeAtom> {
  let source = caller(PARENT);
  return new CompilableDomAtom(value, source, value => output =>
    output.atom(runtimeNode(value), source)
  );
}

export interface TextAtom {
  readonly kind: "Text";
  readonly data: Var<string>;
}

export interface CommentAtom {
  readonly kind: "Comment";
  readonly data: Var<string>;
}

export interface NodeAtom {
  readonly kind: "Node";
  readonly node: Var<SimpleNode>;
}

export type DomAtom = TextAtom | CommentAtom | NodeAtom;

export function runtimeText(value: Var<string>): TextAtom {
  return {
    kind: "Text",
    data: value,
  };
}

export function runtimeComment(value: Var<string>): CommentAtom {
  return {
    kind: "Comment",
    data: value,
  };
}

export function runtimeNode(value: Var<SimpleNode>): NodeAtom {
  return {
    kind: "Node",
    node: value,
  };
}

export type AttrCursor = SimpleElement;
export type AttrAtom = DomAttr;

export class AttrOps implements Operations<AttrCursor, AttrAtom> {
  appender(cursor: SimpleElement): RegionAppender<SimpleElement, DomAttr> {
    return new SimpleAttrOutput(cursor);
  }
  defaultAtom(atom: AttrAtom): AttrAtom {
    return atom;
  }
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

export class DomRange implements ReactiveRange<DomCursor> {
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

export class SimpleAttrOutput implements RegionAppender<AttrCursor, AttrAtom> {
  #current: SimpleElement;

  constructor(current: SimpleElement) {
    this.#current = current;
  }

  getChild(): AppenderForCursor<AttrCursor, AttrAtom> {
    throw new Error("Method not implemented.");
  }

  finalize(): ReactiveRange<AttrCursor> {
    // nothing to do
    return new StaticReactiveRange(this.getCursor());
  }

  getCursor(): SimpleElement {
    return this.#current;
  }

  atom(atom: DomAttr): void | Updater {
    if (atom.ns) {
      this.#current.setAttributeNS(
        atom.ns.current,
        atom.name.current,
        atom.value.current
      );
    } else {
      this.#current.setAttribute(atom.name.current, atom.value.current);
    }

    return new AttributeUpdate(this.#current, atom);
  }
}

export class SimpleDomOutput implements RegionAppender<DomCursor, DomAtom> {
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

  getCursor(): DomCursor {
    // in principle, working through a current cursor should make this code
    // more amenable to rehydration as a future extension.
    return new DomCursor(this.#stack.current, null);
  }

  finalize(): ReactiveRange<DomCursor> {
    return this.#range.finalize(this.getCursor());
  }

  private insert(node: SimpleNode): void {
    this.getCursor().insert(node);
    this.#range.appended(node);
  }

  getChild(): AppenderForCursor<DomCursor, DomAtom> {
    return (cursor: DomCursor) => new SimpleDomOutput(cursor, this.#stack);
  }

  atom(inline: DomAtom): Updater {
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
}
