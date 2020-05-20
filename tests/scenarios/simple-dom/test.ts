import createDocument from "@simple-dom/document";
import type { SimpleElement } from "@simple-dom/interface";
import HTMLSerializer from "@simple-dom/serializer";
import voidMap from "@simple-dom/void-map";
import {
  annotate,
  Param,
  call,
  caller,
  Cell,
  CompiledProgram,
  constant,
  Derived,
  Dict,
  PARENT,
  ReactiveParameters,
  RootBlock,
  Var,
  Compiler,
  ReactiveInputs,
  ReactiveParameter,
  ReactiveParametersForInputs,
} from "everafter";
import type * as qunit from "qunit";
import { host, module, test } from "../../helpers";
import {
  attr,
  DomCursor,
  element,
  text,
  DomAtom,
  DefaultDomAtom,
  CompileDomOps,
  AppendingDomRange,
} from "./output";

@module("values")
export class ValueTest {
  declare assert: qunit.Assert;

  #host = host();

  @test "simple values"(): void {
    const compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
    });

    // corresponds to `{{@hello}} {{@world}}`
    const program = compiler.compile((b, { hello, world }) => {
      b.atom(text(hello));
      b.atom(text(constant(" ")));
      b.atom(text(world));
    });

    // create our input state
    let world = Cell("world");
    let hello = Cell("hello");
    let derivedWorld = Derived(() => world.current.toUpperCase());

    let result = this.render(program, { hello, world: derivedWorld }).expect(
      "hello WORLD"
    );

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
    const compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
      showChild: Param<boolean>(),
    });

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    const program = compiler.compile((b, { showChild, hello, world }) => {
      b.ifBlock(
        showChild,
        annotate(b => {
          b.atom(text(hello));
          b.atom(text(constant(" ")));
          b.atom(text(call(uppercase, world)));
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

    // Initial
    let result = this.render(program, {
      hello,
      world: derivedWorld,
      showChild,
    }).expect("hello WORLD");

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
    const compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
      showChild: Param<boolean>(),
    });

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    // the "program"
    //
    // corresponds to `{{#if @showChild}}{{@hello}} {{@world}}{{/if}}{{else}}{{@hello}}{{/if}}`
    const program = compiler.compile((b, { hello, world, showChild }) => {
      b.ifBlock(
        showChild,
        annotate(b => {
          b.atom(text(hello));
          b.atom(text(constant(" ")));
          b.atom(text(world));
        }),
        annotate(b => {
          b.atom(text(call(uppercase, hello)));
        })
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let derivedWorld = Derived(() => uppercase.f(world));
    let showChild = Cell(true);

    let result = this.render(program, {
      hello,
      world: derivedWorld,
      showChild,
    }).expect("hello WORLD");

    // update a cell
    result.update(() => (hello.current = "goodbye"), "goodbye WORLD");

    // update the input to a derived reactive value
    result.update(() => (world.current = "planet"), "goodbye PLANET");

    result.update(() => (showChild.current = false), "GOODBYE");

    result.update(() => (hello.current = "hello"), "HELLO");
  }

  @test element(): void {
    // corresponds to `<p>{{@hello}} {{@world}}</p>`

    const compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
    });

    const program = compiler.compile((p, { hello, world }) => {
      let el = p.open(element("p"));
      let body = el.flush();
      body.atom(text(hello));
      body.atom(text(constant(" ")));
      body.atom(text(call(uppercase, world)));
      body.close();
    });

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let derivedWorld = Derived(() => uppercase.f(world));

    let result = this.render(program, {
      hello,
      world: derivedWorld,
    }).expect("<p>hello WORLD</p>");

    // update a cell
    result.update(() => (hello.current = "goodbye"), "<p>goodbye WORLD</p>");

    // update the input to a derived reactive value
    result.update(() => (world.current = "planet"), "<p>goodbye PLANET</p>");
  }

  @test attributes(): void {
    let compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
      title: Param<string>(),
    });

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    // the "program"
    //
    // corresponds to `<p>{{@hello}} {{@world}}</p>`
    const template = compiler.compile((b, { title, hello, world }) => {
      b.open(
        element("p"),
        el => {
          el.atom(attr(constant("title"), title));
        },
        body => {
          body.atom(text(hello));
          body.atom(text(constant(" ")));
          body.atom(text(call(uppercase, world)));
        }
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let title = Cell("ember");
    let derivedWorld = Derived(() => uppercase.f(world));

    let result = this.render(template, {
      hello,
      world: derivedWorld,
      title: title,
    }).expect(`<p title="ember">hello WORLD</p>`);

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
    let compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
      title: Param<string>(),
    });

    const uppercase = annotate((input: Var<string>): string =>
      input.current.toUpperCase()
    );

    // the "program"
    //
    // corresponds to `<p>{{@hello}} {{@world}}</p>`
    const template = compiler.compile((p, { title, hello, world }) => {
      p.open(
        element("p"),
        el => {
          el.atom(attr(constant("title"), title));
        },
        body => {
          body.atom(text(hello));
          body.atom(text(constant(" ")));
          body.atom(text(call(uppercase, world)));
        }
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let title = Cell("ember");
    let derivedWorld = Derived(() => uppercase.f(world));

    let result = this.render(template, {
      hello,
      world: derivedWorld,
      title: title,
    }).expect(`<p title="ember">hello WORLD</p>`);

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

  private compiler<I extends ReactiveInputs<Dict<ReactiveParameter>>>(
    inputs: I
  ): Compiler<
    DomCursor,
    DomAtom,
    DefaultDomAtom,
    ReactiveParametersForInputs<I>
  > {
    return Compiler.for(inputs, this.#host, new CompileDomOps());
  }

  private render<A extends Dict<Var>>(
    program: CompiledProgram<DomCursor, DomAtom, ReactiveParameters>,
    state: A
  ): RenderExpectation {
    let doc = createDocument();
    let parent = doc.createElement("div");
    let root = program.render(state, AppendingDomRange.appending(parent));
    return new RenderExpectation(root, parent, this.assert);
  }
}

class RenderExpectation {
  #invocation: RootBlock<DomCursor, DomAtom>;
  #element: SimpleElement;
  #assert: qunit.Assert;
  #last: string | undefined = undefined;

  constructor(
    invocation: RootBlock<DomCursor, DomAtom>,
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
