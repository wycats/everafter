import type {
  AttrNamespace,
  SimpleDocument,
  SimpleDocumentFragment,
  SimpleElement,
  SimpleNode,
} from "@simple-dom/interface";
import {
  annotate,
  AppendingReactiveRange,
  caller,
  CompilableAtom,
  CompileCursorAdapter,
  CompileOperations,
  DEBUG,
  DebugFields,
  description,
  Evaluate,
  PARENT,
  ReactiveParameter,
  ReactiveRange,
  ReactiveState,
  Region,
  Source,
  Structured,
  unreachable,
  Updater,
  Var,
} from "everafter";
import { AttributeUpdate, NodeUpdate, NodeValueUpdate } from "./update";

export type DefaultDomAtom = ReactiveParameter<string>;

export class CompileDomOps
  implements CompileOperations<DomCursor, DomAtom, DefaultDomAtom> {
  defaultAtom(atom: DefaultDomAtom): CompilableAtom<DomCursor, DomAtom> {
    return text(atom);
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
): CompileCursorAdapter<DomCursor, DomAtom, AttrCursor, AttrAtom, AttrAtom> {
  return {
    ops: new CompileAttrOps(),

    runtime: {
      child(
        range: AppendingReactiveRange<DomCursor, DomAtom>
      ): AppendingReactiveRange<AttrCursor, AttrAtom> {
        let element = range.document.createElement(tagName);
        return new AttrRange(element);
      },

      flush(
        parent: AppendingReactiveRange<DomCursor, DomAtom>,
        child: ReactiveRange<AttrCursor, AttrAtom>
      ): AppendingReactiveRange<DomCursor, DomAtom> {
        parent.insert(child.element);
        return new AppendingDomRange(new DomCursor(child.element, null));
      },
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

export class CompileAttrOps
  implements CompileOperations<AttrCursor, AttrAtom, never> {
  defaultAtom(atom: never): never {
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

export class DomRange implements ReactiveRange<DomCursor, DomAtom> {
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

  append(_atom: DomAtom): void {
    throw new Error("not implemented");
  }

  clear(): AppendingDomRange {
    let afterLast = this.end.nextSibling;
    let current: SimpleNode | null = this.start;

    while (current !== null && current !== afterLast) {
      let next: SimpleNode | null = current.nextSibling;
      this.parentNode.removeChild(current);
      current = next;
    }

    return new AppendingDomRange(new DomCursor(this.parentNode, afterLast));
  }
}

export class AppendingDomRange
  implements AppendingReactiveRange<DomCursor, DomAtom> {
  static appending(parentNode: ParentNode): AppendingDomRange {
    return new AppendingDomRange(new DomCursor(parentNode, null));
  }

  static splicing(
    parentNode: ParentNode,
    nextSibling: SimpleNode
  ): AppendingDomRange {
    return new AppendingDomRange(new DomCursor(parentNode, nextSibling));
  }

  #start: SimpleNode | null = null;
  #end: SimpleNode | null = null;
  #cursor: DomCursor;
  #document: SimpleDocument;

  constructor(cursor: DomCursor) {
    this.#cursor = cursor;
    this.#document = cursor.parentNode.ownerDocument;
  }

  get document(): SimpleDocument {
    return this.#document;
  }

  getCursor(): DomCursor {
    return this.#cursor;
  }

  [DEBUG](): Structured {
    return description("AppendingRange");
  }

  insert(node: SimpleNode): void {
    this.#cursor.insert(node);

    this.#end = node;

    if (this.#start === null) {
      this.#start = node;
    }
  }

  append(inline: DomAtom): Updater {
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

        return new NodeValueUpdate(node, inline.data);
      }

      case "Node": {
        let node = inline.node.current;
        this.insert(node);

        return new NodeUpdate(node, inline.node);
      }

      default:
        unreachable(inline);
    }
  }

  child(): AppendingReactiveRange<DomCursor, DomAtom> {
    return new AppendingDomRange(this.#cursor);
  }

  finalize(): ReactiveRange<DomCursor, DomAtom> {
    let doc = this.#document;
    let cursor = this.#cursor;

    if (this.#start === null || this.#end === null) {
      let comment = doc.createComment("");
      this.insert(comment);

      return new DomRange(cursor.parentNode, comment, comment);
    } else {
      return new DomRange(cursor.parentNode, this.#start, this.#end);
    }
  }
}

class AttrRange
  implements
    AppendingReactiveRange<AttrCursor, AttrAtom>,
    ReactiveRange<AttrCursor, AttrAtom> {
  #current: SimpleElement;

  constructor(current: SimpleElement) {
    this.#current = current;
  }

  get element(): SimpleElement {
    return this.#current;
  }

  append(atom: DomAttr): void | Updater {
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

  getCursor(): SimpleElement {
    return this.#current;
  }

  child(): AppendingReactiveRange<AttrCursor, AttrAtom> {
    // TODO: think about this more
    return this;
  }

  finalize(): ReactiveRange<SimpleElement, DomAttr> {
    return this;
  }
  [DEBUG](): Structured {
    return description("AttrRange");
  }
  clear(): AppendingReactiveRange<SimpleElement, DomAttr> {
    throw new Error(
      "Method not implemented. Is it a problem that clearing attributes doesn't make sense? Does it teach us something?"
    );
  }
}
