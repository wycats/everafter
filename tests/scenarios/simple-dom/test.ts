import createDocument from "@simple-dom/document";
import type { SimpleElement } from "@simple-dom/interface";
import HTMLSerializer from "@simple-dom/serializer";
import voidMap from "@simple-dom/void-map";
import type * as qunit from "qunit";
import {
  AbstractOutput,
  Cell,
  Const,
  Derived,
  Dict,
  Output,
  Program,
  ReactiveValue,
  RootBlock,
  block,
} from "reactive-prototype";
import { module, test, host } from "../../helpers";
import { DomCursor, DomOps, element, SimpleDomOutput, text } from "./output";

@module("values")
export class ValueTest {
  declare assert: qunit.Assert;

  #host = host();

  @test "simple values"(): void {
    type HelloWorldArgs = { hello: Cell<string>; world: Derived<string> };

    // corresponds to `{{@hello}} {{@world}}`
    const HelloWorld = (args: HelloWorldArgs, output: Output<DomOps>): void => {
      output.leaf(text(args.hello));
      output.leaf(text(Const(" ")));
      output.leaf(text(args.world));
    };

    // create our input state
    let world = Cell("world");
    let args = {
      hello: Cell("hello"),
      world: Derived(() => world.value.toUpperCase()),
    };

    // Initial
    let result = this.render(HelloWorld, args).expect("hello WORLD");

    // No-op rerender
    result.rerender();

    // Updater
    result.update(() => (args.hello.value = "goodbye"), "goodbye WORLD");
    result.update(() => (world.value = "planet"), "goodbye PLANET");

    // Reset
    result.update(() => {
      args.hello.value = "hello";
      world.value = "world";
    }, "hello WORLD");
  }

  @test conditionals(): void {
    type HelloWorldArgs = {
      hello: Cell<string>;
      world: Derived<string>;
      showChild: Cell<boolean>;
    };

    const hello = (args: HelloWorldArgs, output: Output<DomOps>): void => {
      output.ifBlock(
        args.showChild,
        block(output => {
          output.leaf(text(args.hello));
          output.leaf(text(Const(" ")));
          output.leaf(text(args.world));
        }),
        block(() => {
          /* noop */
        })
      );
    };

    // create our input state
    let world = Cell("world");
    let args: HelloWorldArgs = {
      hello: Cell("hello"),
      world: Derived(() => world.value.toUpperCase()),
      showChild: Cell(true),
    };

    // Initial
    let result = this.render(hello, args).expect("hello WORLD");

    // No-op rerender
    result.rerender();

    // update a cell
    result.update(() => (args.hello.value = "goodbye"), "goodbye WORLD");

    // update derived
    result.update(() => (world.value = "planet"), "goodbye PLANET");

    // update conditional input
    result.update(() => (args.showChild.value = false), "<!---->");

    // reset
    result.update(() => {
      args.hello.value = "hello";
      world.value = "world";
      args.showChild.value = true;
    }, "hello WORLD");
  }

  @test ifElse(): void {
    type HelloWorldArgs = {
      hello: Cell<string>;
      world: Derived<string>;
      showChild: Cell<boolean>;
    };

    // the "program"
    //
    // corresponds to `{{#if @showChild}}{{@hello}} {{@world}}{{/if}}{{else}}{{@hello}}{{/if}}`
    const hello = (args: HelloWorldArgs, output: Output<DomOps>): void => {
      output.ifBlock(
        args.showChild,
        block(output => {
          output.leaf(text(args.hello));
          output.leaf(text(Const(" ")));
          output.leaf(text(args.world));
        }),
        block(output => {
          output.leaf(text(uppercase(args.hello)));
        })
      );
    };

    // build a rendering context for the program
    let { parent: element, output } = this.context();

    function uppercase(input: ReactiveValue<string>): ReactiveValue<string> {
      return Derived(() => input.compute().value.toUpperCase());
    }

    // create our input state
    let world = Cell("world");
    let args: HelloWorldArgs = {
      hello: Cell("hello"),
      world: uppercase(world),
      showChild: Cell(true),
    };

    // invoke an invocation for the program with the input state
    let invocation = new RootBlock(hello, args, output, this.#host);

    // render the first time
    this.expectRender(invocation, element, { expected: "hello WORLD" });

    // update a cell
    this.update(invocation, element, () => (args.hello.value = "goodbye"), {
      expected: "goodbye WORLD",
    });

    // update the input to a derived reactive value
    this.update(invocation, element, () => (world.value = "planet"), {
      expected: "goodbye PLANET",
    });

    this.update(invocation, element, () => (args.showChild.value = false), {
      expected: "GOODBYE",
    });

    this.update(invocation, element, () => (args.hello.value = "hello"), {
      expected: "HELLO",
    });
  }

  @test element(): void {
    type HelloWorldArgs = {
      hello: Cell<string>;
      world: Derived<string>;
    };

    // the "program"
    //
    // corresponds to `<p>{{@hello}} {{@world}}</p>`
    const hello = (args: HelloWorldArgs, output: Output<DomOps>): void => {
      let el = output.open(element(Const("p")));
      el.flush();
      output.leaf(text(args.hello));
      output.leaf(text(Const(" ")));
      output.leaf(text(args.world));
      el.close();
    };

    // build a rendering context for the program
    let { parent, output } = this.context();

    function uppercase(input: ReactiveValue<string>): ReactiveValue<string> {
      return Derived(() => input.compute().value.toUpperCase());
    }

    // create our input state
    let world = Cell("world");
    let args: HelloWorldArgs = {
      hello: Cell("hello"),
      world: uppercase(world),
    };

    // invoke an invocation for the program with the input state
    let invocation = new RootBlock(hello, args, output, this.#host);

    // render the first time
    this.expectRender(invocation, parent, { expected: "<p>hello WORLD</p>" });

    // update a cell
    this.update(invocation, parent, () => (args.hello.value = "goodbye"), {
      expected: "<p>goodbye WORLD</p>",
    });

    // update the input to a derived reactive value
    this.update(invocation, parent, () => (world.value = "planet"), {
      expected: "<p>goodbye PLANET</p>",
    });
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

  private render<Args extends Dict<ReactiveValue>>(
    program: Program<DomOps, Args>,
    args: Args
  ): RenderExpectation<Args> {
    let { parent, output } = this.context();

    // invoke an invocation for the program with the input state
    let root = new RootBlock(program, args, output, this.#host);
    root.render(new DomCursor(parent, null));

    return new RenderExpectation(root, parent, this.assert);
  }

  private expectRender<Args>(
    root: RootBlock<DomOps, Args>,
    element: SimpleElement,
    { expected }: { expected: string }
  ): void {
    root.render(new DomCursor(element, null));
    this.assertHTML(element, expected);
  }

  private update<Args>(
    invocation: RootBlock<DomOps, Args>,
    element: SimpleElement,
    callback: () => void,
    { expected }: { expected: string }
  ): void {
    callback();
    invocation.rerender();

    this.assertHTML(element, expected);
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
    this.#invocation.rerender();

    if (this.#last === undefined) {
      throw new Error(`must render before rerendering`);
    }

    this.assertHTML(this.#element, this.#last);
  }

  update(callback: () => void, expected: string): void {
    callback();
    this.#invocation.rerender();
    this.#last = expected;
    this.assertHTML(this.#element, expected);
  }

  private assertHTML(element: SimpleElement, expected: string): void {
    let actual = new HTMLSerializer(voidMap).serializeChildren(element);
    this.#assert.equal(actual, expected, `HTML: ${expected}`);
  }
}
