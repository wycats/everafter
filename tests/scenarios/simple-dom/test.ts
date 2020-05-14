import createDocument from "@simple-dom/document";
import type { SimpleElement } from "@simple-dom/interface";
import HTMLSerializer from "@simple-dom/serializer";
import voidMap from "@simple-dom/void-map";
import type * as qunit from "qunit";
import {
  AbstractOutput,
  annotate,
  args,
  callerFrame,
  Cell,
  Derived,
  Dict,
  Evaluate,
  PARENT,
  program,
  Reactive,
  ReactiveState,
  ReactiveValue,
  RootBlock,
} from "reactive-prototype";
import { host, module, test } from "../../helpers";
import { DomCursor, DomOps, element, SimpleDomOutput, text } from "./output";

@module("values")
export class ValueTest {
  declare assert: qunit.Assert;

  #host = host();

  @test "simple values"(): void {
    const ARGS = args({ hello: Reactive<string>(), world: Reactive<string>() });

    // corresponds to `{{@hello}} {{@world}}`
    const template = program<DomOps>(ARGS, b => {
      b.leaf(text(ARGS.get("hello")));
      b.leaf(text(ARGS.const(" ")));
      b.leaf(text(ARGS.get("world")));
    });

    // create our input state
    let world = Cell("world");
    let hello = Cell("hello");
    let derivedWorld = Derived(() => world.value.toUpperCase());
    const state = ARGS.hydrate({
      hello,
      world: derivedWorld,
    });

    let result = this.render(template, state).expect("hello WORLD");

    // No-op rerender
    result.rerender();

    // Updater
    result.update(() => (hello.value = "goodbye"), "goodbye WORLD");
    result.update(() => (world.value = "planet"), "goodbye PLANET");

    // Reset
    result.update(() => {
      hello.value = "hello";
      world.value = "world";
    }, "hello WORLD");
  }

  @test conditionals(): void {
    const ARGS = args({
      hello: Reactive<string>(),
      world: Reactive<string>(),
      showChild: Reactive<boolean>(),
    } as const);

    const uppercase = annotate((input: ReactiveValue<string>): string =>
      input.value.toUpperCase()
    );

    const template = program<DomOps>(ARGS, b => {
      b.ifBlock(
        ARGS.get("showChild"),
        annotate(b => {
          b.leaf(text(ARGS.get("hello")));
          b.leaf(text(ARGS.const(" ")));
          b.leaf(text(ARGS.call(uppercase, ARGS.get("world"))));
        }),
        annotate(() => {
          /* noop */
        })
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let derivedWorld = Derived(() => world.value.toUpperCase());
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
    result.update(() => (hello.value = "goodbye"), "goodbye WORLD");

    // update derived
    result.update(() => (world.value = "planet"), "goodbye PLANET");

    // update conditional input
    result.update(() => (showChild.value = false), "<!---->");

    // reset
    result.update(() => {
      hello.value = "hello";
      world.value = "world";
      showChild.value = true;
    }, "hello WORLD");
  }

  @test ifElse(): void {
    const ARGS = args({
      hello: Reactive<string>(),
      world: Reactive<string>(),
      showChild: Reactive<boolean>(),
    });

    const uppercase = annotate((input: ReactiveValue<string>): string =>
      input.value.toUpperCase()
    );

    // the "program"
    //
    // corresponds to `{{#if @showChild}}{{@hello}} {{@world}}{{/if}}{{else}}{{@hello}}{{/if}}`
    const template = program<DomOps>(ARGS, b => {
      b.ifBlock(
        ARGS.get("showChild"),
        annotate(b => {
          b.leaf(text(ARGS.get("hello")));
          b.leaf(text(ARGS.const(" ")));
          b.leaf(text(ARGS.get("world")));
        }),
        annotate(b => {
          b.leaf(text(ARGS.call(uppercase, ARGS.get("hello"))));
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
    result.update(() => (hello.value = "goodbye"), "goodbye WORLD");

    // update the input to a derived reactive value
    result.update(() => (world.value = "planet"), "goodbye PLANET");

    result.update(() => (showChild.value = false), "GOODBYE");

    result.update(() => (hello.value = "hello"), "HELLO");
  }

  @test element(): void {
    const ARGS = args({
      hello: Reactive<string>(),
      world: Reactive<string>(),
    });

    const uppercase = annotate((input: ReactiveValue<string>): string =>
      input.value.toUpperCase()
    );

    // the "program"
    //
    // corresponds to `<p>{{@hello}} {{@world}}</p>`
    const template = program<DomOps>(ARGS, b => {
      let el = b.open(element(ARGS.const("p")));
      let body = el.flush();
      body.leaf(text(ARGS.get("hello")));
      body.leaf(text(ARGS.const(" ")));
      body.leaf(text(ARGS.call(uppercase, ARGS.get("world"))));
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
    result.update(() => (hello.value = "goodbye"), "<p>goodbye WORLD</p>");

    // update the input to a derived reactive value
    result.update(() => (world.value = "planet"), "<p>goodbye PLANET</p>");
  }

  private context(): {
    parent: SimpleElement;
    output: (cursor: DomCursor) => AbstractOutput<DomOps>;
  } {
    let doc = createDocument();
    let parent = doc.createElement("div");
    let output = (cursor: DomCursor): SimpleDomOutput =>
      new SimpleDomOutput(cursor);

    return { parent, output };
  }

  private render<A extends Dict<ReactiveValue>>(
    template: (state: ReactiveState) => Evaluate<DomOps>,
    state: ReactiveState<A>
  ): RenderExpectation<A> {
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

class RenderExpectation<Args extends Dict<ReactiveValue>> {
  #invocation: RootBlock<DomOps, Args>;
  #element: SimpleElement;
  #assert: qunit.Assert;
  #last: string | undefined = undefined;

  constructor(
    invocation: RootBlock<DomOps, Args>,
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
    this.#invocation.rerender(callerFrame(PARENT));

    if (this.#last === undefined) {
      throw new Error(`must render before rerendering`);
    }

    this.assertHTML(this.#element, this.#last);
  }

  update(callback: () => void, expected: string): void {
    callback();
    this.#invocation.rerender(callerFrame(PARENT));
    this.#last = expected;
    this.assertHTML(this.#element, expected);
  }

  private assertHTML(element: SimpleElement, expected: string): void {
    let actual = new HTMLSerializer(voidMap).serializeChildren(element);
    this.#assert.equal(actual, expected, `HTML: ${expected}`);
  }
}
