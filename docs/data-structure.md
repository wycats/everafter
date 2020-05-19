In the README, we worked with pre-build EverAfter data structures. Now, we'll learn how to build one of our own.

The basic components of an EverAfter data structure is:

1. `Region`: A runtime definition of your data structure, explaining how to
   insert atoms and blocks.
2. `Compilable`: A definition-time descripion of atoms and blocks that take
   `ReactiveArgument`s as inputs. At runtime, EverAfter hands each `Compilable`
   a `RuntimeState`, getting back a function that inserts the atom or block
   into a runtime `Region`.
3. `Operation`, a function that takes a region and returns an `Updater`.

Here's a high-level picture of how the pieces fit together.

![system description](./system.png)

A program is made up of `Compilable`s, and is be hydrated into an `Operation` with the state of a running system.

# Compilable

EverAfter data structures are made up of _reactive arguments_, which represent values that are known when building the program. They are compiled into functions that take a `Region` and operate on it.

First, let's build a simple compilable for a DOM text node, and then dig a little bit deeper into the concepts.

```ts
class CompilableTextNode {
  #text: ReactiveArgument<string>;

  constructor(text: ReactiveArgument<string>) {
    this.#text = text;
  }

  compile(state: ReactiveState): Evaluate<DomOps> {
    let value = this.#value.hydrate(state);
    return region => region.atom({ kind: "Text", data: value });
  }
}

function text(data: ReactiveArgument<string>): CompilableTextNode {
  return new CompilableTextNode(data);
}
```

In order to understand how this works, we will also need to implement a bit of our `Region`.

```ts
type DomCursor = { parentNode: Element; nextSibling: Node | null };

export class DomRegion {
  #document: Document;
  #cursor: DomCursor;

  constructor(cursor: DomCursor) {
    this.#document = cursor.parentNode.ownerDocument;
    this.#cursor = cursor;
  }

  atom(atom: { kind: "Text"; data: Var<string> }) {
    let data = atom.data.value;
    let node = this.#document.createTextNode(data);
    this.#cursor.parentNode.insertBefore(node, this.#cursor.nextSibling);
  }
}
```

This inserts the text node into the DOM, but we also need to teach EverAfter how to update the text value if the data changes.

We accomplish that with `Updater`s.

```ts
export class TextUpdater implements Updater {
  #node: Text;
  #data: Var<string>;

  constructor(node: Text, value: Var<string>) {
    this.#node = node;
    this.#value = value;
  }

  poll(): void {
    this.#node.nodeValue = this.#data.value;
  }
}
```

Updating the region:

```ts
type DomCursor = { parentNode: Element; nextSibling: Node | null };

export class DomRegion {
  #document: Document;
  #cursor: DomCursor;

  constructor(cursor: DomCursor) {
    this.#document = cursor.parentNode.ownerDocument;
    this.#cursor = cursor;
  }

  atom(atom: { kind: "Text"; data: Var<string> }) {
    let data = atom.data.value;
    let node = this.#document.createTextNode(data);
    this.#cursor.parentNode.insertBefore(node, this.#cursor.nextSibling);
    return new TextUpdater(node, data);
  }
}
```

> Note: When EverAfter polls an updater, it checks to see whether the value is `const`. If the value is `const`, the updater will not be polled again the next time the system is updated.

## Region

Let's implement a minimal `Region` for appending text nodes into the DOM.

```ts
type DomCursor = { parentNode: Element; nextSibling: Node | null };

export class DomRegion implements RegionAppender<DomOps> {
  #document: SimpleDocument;
  #cursor: DomCursor;

  constructor(cursor: DomCursor) {
    this.#document = cursor.parentNode.ownerDocument;
    this.#cursor = cursor;
  }

  getChild(): (cursor: DomCursor) => DomRegion {
    return (cursor: DomCursor) => new DomRegion(cursor);
  }

  getCursor(): DomCursor {
    return this.#cursor;
  }

  finalize(): ReactiveRange<DomOps> {
    // nothing yet
  }

  atom(atom: { data: Var<string> }): Updater {
    let data = atom.data.value;
    let node = this.#document.createTextNode(data);
    return new TextNode();
  }

  open(open: unknown): void {
    // nothing yet
  }
}
```

### `getChild`

The `getChild` method takes a cursor and creates a new, equivalent region that is logically a child of the current region. It's used by `if` to create persistent blocks that can be torn down and re-created when an `if`'s condition changes.

### `getCursor`

The `getCursor` method returns the current cursor for the region. This is used by EverAfter's internals to build new persistent blocks.

### `finalize`

There's nothing for us to do here yet.

### `atom`

This method takes an atom for this region, inserts it at the current cursor, and returns an `Updater` that should be polled whenever the system is updated.

> Note: The updater is ignored if the reactive variables consumed during the `atom` call are constant.

## Comment Nodes

Let's expand our `Region` to support another kind of atom: comment nodes.

```ts
type DomCursor = { parentNode: Element; nextSibling: Node | null };

export class DomRegion implements RegionAppender<DomOps> {
  // ...
  atom(atom: { type: "Text" | "Comment"; data: Var<string> }): Updater {
    switch (atom.type) {
      case "Text": {
        let data = atom.data.value;
        let node = this.#document.createTextNode(data);
        return new DataNode(node, atom.data);
      }

      case "Comment": {
        let data = atom.data.value;
        let node = this.#document.createCommentNode(data);
        return new DataNode(node, atom.data);
      }
    }
  }
  // ...
}

export class DataUpdater implements Updater {
  #node: Text | Comment;
  #data: Var<string>;

  constructor(node: Text | Comment, value: Var<string>) {
    this.#node = node;
    this.#value = value;
  }

  poll(): void {
    this.#node.nodeValue = this.#data.value;
  }
}
```

And let's turn `CompilableTextNode` into `CompilableDataNode`.

```ts
class CompilableDataNode {
  #text: ReactiveArgument<string>;
  #kind: "Text" | "Comment";

  constructor(text: ReactiveArgument<string>, kind: "Text" | "Comment") {
    this.#text = text;
    this.#kind = kind;
  }

  compile(state: ReactiveState): Evaluate<DomOps> {
    let value = this.#value.hydrate(state);
    return region => region.atom({ kind: this.#kind, data: value });
  }
}

function text(data: ReactiveArgument<string>): CompilableTextNode {
  return new CompilableDataNode(data, "Text");
}

function comment(data: ReactiveArgument<string>): CompilableTextNode {
  return new CompilableDataNode(data, "Comment");
}
```

And now we can update our program to use comments.

```ts
const program = Program(ARGS, (p, { hello, world, title }) => {
  p.open(p.const("div"), el => {
    el.head("title", title)
  }, [
    p.atom(text(hello));
    p.atom(comment(Const(" hi there ")))
    p.atom(text(p.const(" ")));
    p.atom(text(world));
  ]);
});

const hello = Cell("hello");
const world = Cell("world");
const title = Cell("EverAfter Demo");

// create an output data structure to write into, in this case a DOM element
const output = document.createElement("div");

// define a cursor into the output DOM
const cursor = { parentNode: output, nextSibling: null };

// initialize the system by assigning each of its arguments to a reactive
// input, and supplying it with a cursor to write into
const system = program.initialize({ hello, world, title }, cursor);

output; // <div title="EverAfter Demo">hello<!-- hi there --> world</div>
```

## Elements

So far, we've implemented a reactive data structure that inserts text nodes and comments into a parent. To make our data structure useful, we also need to be able to insert elements.

To accomplish that, we need one last concept: the "cursor adapter". A cursor adapter describes how to nest one output data structure into another.

### AttrRegion

The trick here is to think of the attributes in an element like their own region, but with different atoms. Instead of inserting text, comment and element nodes into a parent node, an attribute region inserts attributes into a parent element.

The cursor for an attribute region is an element. An attribute region has one atom, `DomAttr`, which has two reactive variables for the attribute's name and value, and an optional reactive variable for its namespace.

```ts
export interface DomAttr {
  readonly name: Var<string>;
  readonly value: Var<string>;
  readonly ns: Var<AttrNamespace> | null;
}

export class AttrRegion {
  #current: SimpleElement;

  constructor(current: SimpleElement) {
    this.#current = current;
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

    return new AttributeUpdater(this.#current, atom);
  }
}
```

### `AttributeUpdater`

The `Updater` implementation for attributes is straight-forward.

```ts
export class AttributeUpdate implements Updater {
  #element: SimpleElement;
  #attr: DomAttr;

  constructor(element: SimpleElement, attr: DomAttr) {
    this.#element = element;
    this.#attr = attr;
  }

  poll(): void {
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
  }
}
```

Whenever the updater is polled, update the relevant attribute on the element. As before, if the reactive variables used in `poll` become constant, the updater won't be checked anymore in subsequent system updates.

### Adapting DomRegion to AttrRegion

Next, we need to adapt `DomRegion`, which inserts DOM nodes into a `parentNode` / `nextSibling` cursor, into `AttrRegion`, which inserts attributes into an `Element` cursor.

A `CursorAdapter` has two parts:

1. `child`, which takes a cursor from the parent region and returns a child region
2. `flush`, which takes a cursor from the parent region, a range from the child region,
   and glues the child range into the parent region. The `flush` method is called after
   all of the child atoms are inserted into the child region.

```ts
export function element(tagName: string): CursorAdapter<DomOps, AttrOps> {
  return {
    child(cursor: DomCursor): SimpleAttrOutput {
      let element = cursor.parentNode.ownerDocument.createElement(tagName);
      return new AttrRange(element);
    },

    flush(parent: DomCursor, child: SimpleElement): RegionAppender<DomOps> {
      parent.insert(child);
      return new SimpleDomOutput(new DomCursor(child, null));
    },
  };
}
```

In our case, `child` creates a new element and turns it into the cursor for a new `AttrRange`.

The `flush` method inserts the new element into the parent's cursor.

### Usage

The most basic way to use nested content in EverAfter looks like this:

```ts
const program = Program(ARGS, (p, { hello, world, title }) => {
  // open a div
  let el = p.open(p.const("div"));
  // insert an attribute atom into the div
  el.atom({ name: ARGS.const("title"), value: title });
  // finish up with attributes
  let body = el.flush();
  // insert some atoms into the new element
  body.atom(text(hello));
  body.atom(comment(Const(" hi there ")));
  body.atom(text(p.const(" ")));
  body.atom(text(world));
  // finish up with the new element; subsequent atoms go into the parent element
  body.close();
});
```

There's also a shorthand for saying all of those things together that inserts a flush between the attribute atoms and the body atoms, and inserts a close at the very end.

```ts
const program = Program(ARGS, (p, { hello, world, title }) => {
  p.open(
    p.const("div"),
    el => {
      el.atom({ name: ARGS.const("title"), value: title });
    },
    body => {
      body.atom(text(hello));
      body.atom(comment(Const(" hi there ")));
      body.atom(text(p.const(" ")));
      body.atom(text(world));
    }
  );
});
```

# That's It

We had to do some work to teach EverAfter about the logic of the DOM as a data structure. But now that we did that, we can define arbitrary programs using conditionals, iteration and invocation, and the output data structure will remain up to date.

We also get a number of benefits for free:

1. If the input reactive variables to any operation are constant, nothing about that operation will appear in the updater list.
2. This is also true about operations that once depended on dynamic reactive variables, but later on comes to depend entirely on constant reactive variables.
3. If the input reactive variables to any block haven't changed, system updates will skip the entire block, not even bothering to recompute values or do `===` checks.
4. We can enhance this system to allow us to insert content in a foreign element (like "portals" or "wormholes" in Ember and React) simply by creating a new kind of `open` operation that changes the cursor. It would work almost exactly like creating a new element from scratch.
5. If we want, we can allow programs to `open` a completely different data structure that would be managed by the system. For example, we could allow a block to manage `localstorage`, but be logically nested inside of a program that is emitting a DOM tree.
