import createDocument from "@simple-dom/document";
import type { SimpleElement } from "@simple-dom/interface";
import HTMLSerializer from "@simple-dom/serializer";
import voidMap from "@simple-dom/void-map";
import type * as qunit from "qunit";
import {
  annotate,
  args,
  caller,
  Cell,
  Derived,
  Dict,
  Evaluate,
  PARENT,
  program,
  Arg,
  ReactiveState,
  Var,
  RootBlock,
  RegionAppender,
} from "reactive-prototype";
import { host, module, test } from "../../helpers";
import {
  DomCursor,
  DomOps,
  element,
  SimpleDomOutput,
  text,
  attr,
} from "./output";

@module("values")
export class ValueTest {
  declare assert: qunit.Assert;

  #host = host();

  @test "simple values"(): void {
    const ARGS = args({ hello: Arg<string>(), world: Arg<string>() });

    // corresponds to `{{@hello}} {{@world}}`
    const template = program<DomOps>(b => {
      b.atom(text(ARGS.get("hello")));
      b.atom(text(ARGS.const(" ")));
      b.atom(text(ARGS.get("world")));
    });

    // create our input state
    let world = Cell("world");
    let hello = Cell("hello");
    let derivedWorld = Derived(() => world.current.toUpperCase());
    const state = ARGS.hydrate({
      hello,
      world: derivedWorld,
    });

    let result = this.render(template, state).expect("hello WORLD");

    // No-op rerender
    result.rerender();

    // Updater
    result.update(() => (hello.current = "goodbye"), "goodbye WORLD");
    result.update(() => (world.current = "planet"), "goodbye PLANET");

    // Reset
    result.update(() => {
      hello.current = "hello";
      world.current = "world";
    }, "hello WORLD");
  }

  @test conditionals(): void {
    const ARGS = args({
      hello: Arg<string>(),
      world: Arg<string>(),
      showChild: Arg<boolean>(),
    } as const);

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    const template = program<DomOps>(b => {
      b.ifBlock(
        ARGS.get("showChild"),
        annotate(b => {
          b.atom(text(ARGS.get("hello")));
          b.atom(text(ARGS.const(" ")));
          b.atom(text(ARGS.call(uppercase, ARGS.get("world"))));
        }),
        annotate(() => {
          /* noop */
        })
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let derivedWorld = Derived(() => world.current.toUpperCase());
    let showChild = Cell(true);

    let state = ARGS.hydrate({
      hello,
      world: derivedWorld,
      showChild,
    });

    // Initial
    let result = this.render(template, state).expect("hello WORLD");

    // No-op rerender
    result.rerender();

    // update a cell
    result.update(() => (hello.current = "goodbye"), "goodbye WORLD");

    // update derived
    result.update(() => (world.current = "planet"), "goodbye PLANET");

    // update conditional input
    result.update(() => (showChild.current = false), "<!---->");

    // reset
    result.update(() => {
      hello.current = "hello";
      world.current = "world";
      showChild.current = true;
    }, "hello WORLD");
  }

  @test ifElse(): void {
    const ARGS = args({
      hello: Arg<string>(),
      world: Arg<string>(),
      showChild: Arg<boolean>(),
    });

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    // the "program"
    //
    // corresponds to `{{#if @showChild}}{{@hello}} {{@world}}{{/if}}{{else}}{{@hello}}{{/if}}`
    const template = program<DomOps>(b => {
      b.ifBlock(
        ARGS.get("showChild"),
        annotate(b => {
          b.atom(text(ARGS.get("hello")));
          b.atom(text(ARGS.const(" ")));
          b.atom(text(ARGS.get("world")));
        }),
        annotate(b => {
          b.atom(text(ARGS.call(uppercase, ARGS.get("hello"))));
        })
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let derivedWorld = Derived(() => uppercase.f(world));
    let showChild = Cell(true);

    let state = ARGS.hydrate({
      hello,
      world: derivedWorld,
      showChild,
    });

    let result = this.render(template, state).expect("hello WORLD");

    // update a cell
    result.update(() => (hello.current = "goodbye"), "goodbye WORLD");

    // update the input to a derived reactive value
    result.update(() => (world.current = "planet"), "goodbye PLANET");

    result.update(() => (showChild.current = false), "GOODBYE");

    result.update(() => (hello.current = "hello"), "HELLO");
  }

  @test element(): void {
    const ARGS = args({
      hello: Arg<string>(),
      world: Arg<string>(),
    });

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    // the "program"
    //
    // corresponds to `<p>{{@hello}} {{@world}}</p>`
    const template = program<DomOps>(b => {
      let el = b.open(element(ARGS.const("p")));
      let body = el.flush();
      body.atom(text(ARGS.get("hello")));
      body.atom(text(ARGS.const(" ")));
      body.atom(text(ARGS.call(uppercase, ARGS.get("world"))));
      body.close();
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let derivedWorld = Derived(() => uppercase.f(world));
    let state = ARGS.hydrate({
      hello,
      world: derivedWorld,
    });

    let result = this.render(template, state).expect("<p>hello WORLD</p>");

    // update a cell
    result.update(() => (hello.current = "goodbye"), "<p>goodbye WORLD</p>");

    // update the input to a derived reactive value
    result.update(() => (world.current = "planet"), "<p>goodbye PLANET</p>");
  }

  @test attributes(): void {
    const ARGS = args({
      hello: Arg<string>(),
      world: Arg<string>(),
      title: Arg<string>(),
    });

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    // the "program"
    //
    // corresponds to `<p>{{@hello}} {{@world}}</p>`
    const template = program<DomOps>(b => {
      let el = b.open(element(ARGS.const("p")));
      el.head(attr(ARGS.const("title"), ARGS.get("title")));
      let body = el.flush();
      body.atom(text(ARGS.get("hello")));
      body.atom(text(ARGS.const(" ")));
      body.atom(text(ARGS.call(uppercase, ARGS.get("world"))));
      body.close();
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let title = Cell("ember");
    let derivedWorld = Derived(() => uppercase.f(world));
    let state = ARGS.hydrate({
      hello,
      world: derivedWorld,
      title: title,
    });

    let result = this.render(template, state).expect(
      `<p title="ember">hello WORLD</p>`
    );

    // update a cell
    result.update(
      () => (hello.current = "goodbye"),
      `<p title="ember">goodbye WORLD</p>`
    );

    // update the input to a derived reactive value
    result.update(
      () => (world.current = "planet"),
      `<p title="ember">goodbye PLANET</p>`
    );

    result.update(
      () => (title.current = "ember-octane"),
      `<p title="ember-octane">goodbye PLANET</p>`
    );
  }

  @test "nested content"(): void {
    const ARGS = args({
      hello: Arg<string>(),
      world: Arg<string>(),
      title: Arg<string>(),
    });

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    // the "program"
    //
    // corresponds to `<p>{{@hello}} {{@world}}</p>`
    const template = program<DomOps>(b => {
      let el = b.open(element(ARGS.const("p")));
      el.head(attr(ARGS.const("title"), ARGS.get("title")));
      let body = el.flush();
      body.atom(text(ARGS.get("hello")));
      body.atom(text(ARGS.const(" ")));
      body.atom(text(ARGS.call(uppercase, ARGS.get("world"))));
      body.close();
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let title = Cell("ember");
    let derivedWorld = Derived(() => uppercase.f(world));
    let state = ARGS.hydrate({
      hello,
      world: derivedWorld,
      title: title,
    });

    let result = this.render(template, state).expect(
      `<p title="ember">hello WORLD</p>`
    );

    // update a cell
    result.update(
      () => (hello.current = "goodbye"),
      `<p title="ember">goodbye WORLD</p>`
    );

    // update the input to a derived reactive value
    result.update(
      () => (world.current = "planet"),
      `<p title="ember">goodbye PLANET</p>`
    );

    result.update(
      () => (title.current = "ember-octane"),
      `<p title="ember-octane">goodbye PLANET</p>`
    );
  }

  private context(): {
    parent: SimpleElement;
    output: (cursor: DomCursor) => RegionAppender<DomOps>;
  } {
    let doc = createDocument();
    let parent = doc.createElement("div");
    let output = (cursor: DomCursor): SimpleDomOutput =>
      new SimpleDomOutput(cursor);

    return { parent, output };
  }

  private render<A extends Dict<Var>>(
    template: (state: ReactiveState) => Evaluate<DomOps>,
    state: ReactiveState<A>
  ): RenderExpectation {
    const render = template(state);

    let { parent, output } = this.context();
    let root = new RootBlock(render, output, this.#host);
    root.render(new DomCursor(parent, null));
    return new RenderExpectation(root, parent, this.assert);
  }

  private assertHTML(element: SimpleElement, expected: string): void {
    let actual = new HTMLSerializer(voidMap).serializeChildren(element);
    this.assert.equal(actual, expected);
  }
}

class RenderExpectation {
  #invocation: RootBlock<DomOps>;
  #element: SimpleElement;
  #assert: qunit.Assert;
  #last: string | undefined = undefined;

  constructor(
    invocation: RootBlock<DomOps>,
    element: SimpleElement,
    assert: qunit.Assert
  ) {
    this.#invocation = invocation;
    this.#element = element;
    this.#assert = assert;
  }

  expect(expected: string): this {
    this.#last = expected;
    this.assertHTML(this.#element, expected);
    return this;
  }

  rerender(): void {
    this.#invocation.rerender(caller(PARENT));

    if (this.#last === undefined) {
      throw new Error(`must render before rerendering`);
    }

    this.assertHTML(this.#element, this.#last);
  }

  update(callback: () => void, expected: string): void {
    callback();
    this.#invocation.rerender(caller(PARENT));
    this.#last = expected;
    this.assertHTML(this.#element, expected);
  }

  private assertHTML(element: SimpleElement, expected: string): void {
    let actual = new HTMLSerializer(voidMap).serializeChildren(element);
    this.#assert.equal(actual, expected, `HTML: ${expected}`);
  }
}
