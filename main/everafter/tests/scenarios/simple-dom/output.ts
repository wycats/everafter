import type {
  AttrNamespace,
  SimpleComment,
  SimpleDocument,
  SimpleDocumentFragment,
  SimpleElement,
  SimpleNode,
  SimpleText,
} from "@simple-dom/interface";
import {
  annotate,
  AppendingReactiveRange,
  caller,
  CompilableAtom,
  CompileCursorAdapter,
  CompileOperations,
  DEBUG,
  description,
  Evaluate,
  Factory,
  factory,
  getOwner,
  initializeEffect,
  IntoEffect,
  intoEffect,
  Owned,
  Owner,
  PARENT,
  ReactiveParameter,
  ReactiveRange,
  ReactiveState,
  Region,
  Structured,
  unreachable,
  Updater,
  UserEffect,
  Var,
} from "everafter";

export class CompilableEffect extends CompilableAtom<DomCursor, DomAtom> {
  #effect: UserEffect<unknown>;

  constructor(owner: Owner, effect: UserEffect<unknown>) {
    super(owner);
    this.#effect = effect;
  }

  compile(_state: ReactiveState): Evaluate<DomCursor, DomAtom> {
    return region => {
      region.updateWith(
        getOwner(this).instantiate(initializeEffect, this.#effect)
      );
    };
  }
}

export function effect(into: IntoEffect<unknown>): Factory<CompilableEffect> {
  return owner => new CompilableEffect(owner, intoEffect(into));
}

export type DefaultDomAtom = ReactiveParameter<string>;

export class CompileDomOps
  implements CompileOperations<DomCursor, DomAtom, DefaultDomAtom> {
  defaultAtom(
    atom: DefaultDomAtom
  ): Factory<CompilableAtom<DomCursor, DomAtom>> {
    return text(atom);
  }
}

interface OpenElement {
  readonly kind: "Element";
  readonly value: Var<string>;
}

export class CompilableAttr extends CompilableAtom<AttrCursor, AttrAtom> {
  #name: ReactiveParameter<string>;
  #value: ReactiveParameter<string>;
  #namespace: ReactiveParameter<AttrNamespace> | null;

  constructor(
    owner: Owner,
    name: ReactiveParameter<string>,
    value: ReactiveParameter<string>,
    namespace: ReactiveParameter<AttrNamespace> | null
  ) {
    super(owner);
    this.#name = name;
    this.#value = value;
    this.#namespace = namespace;
  }

  compile(state: ReactiveState): Evaluate<AttrCursor, AttrAtom> {
    let name = this.#name.hydrate(state);
    let value = this.#value.hydrate(state);
    let ns = this.#namespace ? this.#namespace.hydrate(state) : null;

    return region => region.atom({ name, value, ns });
  }
}

export function attr(
  name: ReactiveParameter<string>,
  value: ReactiveParameter<string>,
  namespace?: ReactiveParameter<AttrNamespace>
): Factory<CompilableAttr> {
  return owner =>
    owner.instantiate(factory(CompilableAttr), name, value, namespace || null);
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
): Factory<
  CompileCursorAdapter<
    DomCursor,
    DomAtom,
    AttrCursor,
    AppendingDomRange,
    AttrRange
  >
> {
  return owner => ({
    ops: new CompileAttrOps(),

    runtime: {
      child(range: AppendingDomRange): AttrRange {
        let element = range.document.createElement(tagName);
        return owner.instantiate(factory(AttrRange), element);
      },

      flush(parent: AppendingDomRange, child: AttrRange): AppendingDomRange {
        parent.insert(child.element);
        return owner.instantiate(
          factory(AppendingDomRange),
          new DomCursor(child.element, null)
        );
      },
    },
  });
}

export type ToRuntime<T> = (
  value: Var<T>
) => (output: Region<DomCursor, DomAtom>) => void;

class CompilableDomAtom<T, A extends DomAtom> extends CompilableAtom<
  DomCursor,
  A
> {
  #value: ReactiveParameter<T>;
  #toRuntime: ToRuntime<T>;

  constructor(
    owner: Owner,
    value: ReactiveParameter<T>,
    toRuntime: (value: Var<T>) => (output: Region<DomCursor, DomAtom>) => void
  ) {
    super(owner);

    this.#value = value;
    this.#toRuntime = toRuntime;
  }

  compile(state: ReactiveState): Evaluate<DomCursor, DomAttr> {
    let value = this.#value.hydrate(state);
    return this.#toRuntime(value);
  }
}

export function text(
  value: ReactiveParameter<string>
): Factory<CompilableDomAtom<string, TextAtom>> {
  return owner =>
    owner.instantiate(
      factory(CompilableDomAtom),
      value,
      (value: Var<string>) => (region: Region<DomCursor, DomAtom>) => {
        region.atom(runtimeText(value));
      }
    );
}

export function comment(
  value: ReactiveParameter<string>
): Factory<CompilableDomAtom<string, CommentAtom>> {
  return owner =>
    owner.instantiate(
      factory(CompilableDomAtom),
      value,
      (value: Var<string>) => (region: Region<DomCursor, DomAtom>) => {
        region.atom(runtimeComment(value));
      }
    );
}

export function node(
  value: ReactiveParameter<SimpleNode>
): Factory<CompilableDomAtom<SimpleNode, NodeAtom>> {
  return owner =>
    owner.instantiate(
      factory(CompilableDomAtom),
      value,
      (value: Var<SimpleNode>) => (region: Region<DomCursor, DomAtom>) => {
        region.atom(runtimeNode(value));
      }
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

export class DomRange extends Owned
  implements ReactiveRange<DomCursor, DomAtom> {
  constructor(
    owner: Owner,
    readonly parentNode: ParentNode,
    readonly start: SimpleNode,
    readonly end: SimpleNode
  ) {
    super(owner);

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

  clears(): AppendingDomRange {
    let afterLast = this.end.nextSibling;
    let current: SimpleNode | null = this.start;

    while (current !== null && current !== afterLast) {
      let next: SimpleNode | null = current.nextSibling;
      this.parentNode.removeChild(current);
      current = next;
    }

    return getOwner(this).instantiate(
      factory(AppendingDomRange),
      new DomCursor(this.parentNode, afterLast)
    );
  }
}

export class AppendingDomRange extends Owned
  implements AppendingReactiveRange<DomCursor, DomAtom> {
  static appending(owner: Owner, parentNode: ParentNode): AppendingDomRange {
    return owner.instantiate(
      factory(AppendingDomRange),
      new DomCursor(parentNode, null)
    );
  }

  static splicing(
    owner: Owner,
    parentNode: ParentNode,
    nextSibling: SimpleNode
  ): AppendingDomRange {
    return owner.instantiate(
      factory(AppendingDomRange),
      new DomCursor(parentNode, nextSibling)
    );
  }

  declare atom: SimpleNode;

  #start: SimpleNode | null = null;
  #end: SimpleNode | null = null;
  #cursor: DomCursor;
  readonly #document: SimpleDocument;

  constructor(owner: Owner, cursor: DomCursor) {
    super(owner);
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

  append(atom: DomAtom): Updater {
    switch (atom.kind) {
      case "Text": {
        let doc = this.#document;

        return getOwner(this).instantiate(initializeEffect, {
          initialize: () => {
            let node = doc.createTextNode(atom.data.current);
            this.insert(node);
            return node;
          },
          update: (node: SimpleText) => {
            node.nodeValue = atom.data.current;
          },
        });
      }

      case "Comment": {
        let doc = this.#document;

        return getOwner(this).instantiate(initializeEffect, {
          initialize: () => {
            let node = doc.createComment(atom.data.current);
            this.insert(node);
            return node;
          },
          update: (node: SimpleComment) => {
            node.nodeValue = atom.data.current;
          },
        });
      }

      case "Node": {
        let node: SimpleNode | undefined = undefined;

        return getOwner(this).instantiate(initializeEffect, {
          initialize: () => {
            node = atom.node.current;
            this.insert(node);
            return node;
          },
          update: (node: SimpleNode) => {
            let newNode = atom.node.current;

            let parent = node.parentNode;

            if (parent === null) {
              throw new Error(
                `invariant: attempted to replace a detached node`
              );
            }

            let nextSibling = node.nextSibling;
            parent.removeChild(node);

            parent.insertBefore(newNode, nextSibling);
          },
        });
      }

      default:
        unreachable(atom);
    }
  }

  child(): AppendingReactiveRange<DomCursor, DomAtom> {
    return getOwner(this).instantiate(factory(AppendingDomRange), this.#cursor);
  }

  finalize(): ReactiveRange<DomCursor, DomAtom> {
    let doc = this.#document;
    let cursor = this.#cursor;

    if (this.#start === null || this.#end === null) {
      let comment = doc.createComment("");
      this.insert(comment);

      return getOwner(this).instantiate(
        factory(DomRange),
        cursor.parentNode,
        comment,
        comment
      );
    } else {
      return getOwner(this).instantiate(
        factory(DomRange),
        cursor.parentNode,
        this.#start,
        this.#end
      );
    }
  }
}

class AttrRange extends Owned
  implements
    AppendingReactiveRange<AttrCursor, AttrAtom>,
    ReactiveRange<AttrCursor, AttrAtom> {
  #current: SimpleElement;

  constructor(owner: Owner, current: SimpleElement) {
    super(owner);
    this.#current = current;
  }

  get element(): SimpleElement {
    return this.#current;
  }

  append(atom: DomAttr): Updater {
    let element = this.#current;

    return getOwner(this).instantiate(initializeEffect, () => {
      if (atom.ns) {
        element.setAttributeNS(
          atom.ns.current,
          atom.name.current,
          atom.value.current
        );
      } else {
        element.setAttribute(atom.name.current, atom.value.current);
      }
    });
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
  clears(): AppendingReactiveRange<SimpleElement, DomAttr> {
    throw new Error(
      "Method not implemented. Is it a problem that clearing attributes doesn't make sense? Does it teach us something?"
    );
  }
}
