import createDocument from "@simple-dom/document";
import type { SimpleElement } from "@simple-dom/interface";
import HTMLSerializer from "@simple-dom/serializer";
import voidMap from "@simple-dom/void-map";
import {
  call,
  Cell,
  CompiledProgram,
  Compiler,
  constant,
  Derived,
  Dict,
  LogLevel,
  Param,
  ReactiveInputs,
  ReactiveParameter,
  ReactiveParameters,
  ReactiveParametersForInputs,
  RootBlock,
  Var,
  sourceFrame,
  caller,
  PARENT,
  f,
} from "everafter";
import type * as qunit from "qunit";
import { module, owner, test } from "../../helpers";
import {
  AppendingDomRange,
  attr,
  CompileDomOps,
  DefaultDomAtom,
  DomAtom,
  DomCursor,
  effect,
  element,
} from "./output";

@module("values")
export class ValueTest {
  declare assert: qunit.Assert;

  #testMessages: string[] = [];
  #owner = owner(this.#testMessages);

  @test "simple values"(): void {
    const compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
    });

    // corresponds to `{{@hello}} {{@world}}`
    const program = compiler.compile((b, { hello, world }) => {
      b.atom(hello);
      b.atom(constant(" "));
      b.atom(world);
    });

    // create our input state
    let world = Cell("world");
    let hello = Cell("hello");
    let derivedWorld = Derived(() => world.current.toUpperCase());

    let result = this.render(program, { hello, world: derivedWorld }).expect(
      "hello WORLD"
    );

    // Updater
    result.update(() => (hello.current = "goodbye")).expect("goodbye WORLD");
    result.update(() => (world.current = "planet")).expect("goodbye PLANET");

    // Reset
    result
      .update(() => {
        hello.current = "hello";
        world.current = "world";
      })
      .expect("hello WORLD");
  }

  @test conditionals(): void {
    const compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
      showChild: Param<boolean>(),
    });

    const uppercase = (input: Var<string>): string =>
      input.current.toUpperCase();

    const program = compiler.compile((b, { showChild, hello, world }) => {
      b.ifBlock(
        showChild,
        f(b => {
          b.atom(hello);
          b.atom(constant(" "));
          b.atom(call(uppercase, world));
        }),
        f(() => {
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

    // update a cell
    result.update(() => (hello.current = "goodbye")).expect("goodbye WORLD");

    // update derived
    result.update(() => (world.current = "planet")).expect("goodbye PLANET");

    // update conditional input
    result.update(() => (showChild.current = false)).expect("<!---->");

    // reset
    result
      .update(() => {
        hello.current = "hello";
        world.current = "world";
        showChild.current = true;
      })
      .expect("hello WORLD");
  }

  @test ifElse(): void {
    const compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
      showChild: Param<boolean>(),
    });

    const uppercase = (input: Var<string>): string =>
      input.current.toUpperCase();

    // the "program"
    //
    // corresponds to `{{#if @showChild}}{{@hello}} {{@world}}{{/if}}{{else}}{{@hello}}{{/if}}`
    const program = compiler.compile((b, { hello, world, showChild }) => {
      b.ifBlock(
        showChild,
        f(b => {
          b.atom(hello);
          b.atom(constant(" "));
          b.atom(world);
        }),
        f(b => {
          b.atom(call(uppercase, hello));
        })
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let derivedWorld = Derived(() => uppercase(world));
    let showChild = Cell(true);

    let result = this.render(program, {
      hello,
      world: derivedWorld,
      showChild,
    }).expect("hello WORLD");

    // update a cell
    result.update(() => (hello.current = "goodbye")).expect("goodbye WORLD");

    // update the input to a derived reactive value
    result.update(() => (world.current = "planet")).expect("goodbye PLANET");

    result.update(() => (showChild.current = false)).expect("GOODBYE");

    result.update(() => (hello.current = "hello")).expect("HELLO");
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
      body.atom(hello);
      body.atom(constant(" "));
      body.atom(call(uppercase, world));
      body.close();
    });

    const uppercase = (input: Var<string>): string =>
      input.current.toUpperCase();

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let derivedWorld = Derived(() => uppercase(world));

    let result = this.render(program, {
      hello,
      world: derivedWorld,
    }).expect("<p>hello WORLD</p>");

    // update a cell
    result
      .update(() => (hello.current = "goodbye"))
      .expect("<p>goodbye WORLD</p>");

    // update the input to a derived reactive value
    result
      .update(() => (world.current = "planet"))
      .expect("<p>goodbye PLANET</p>");
  }

  @test attributes(): void {
    let compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
      title: Param<string>(),
    });

    const uppercase = (input: Var<string>): string =>
      input.current.toUpperCase();

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
          body.atom(hello);
          body.atom(constant(" "));
          body.atom(call(uppercase, world));
        }
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let title = Cell("ember");
    let derivedWorld = Derived(() => uppercase(world));

    let result = this.render(template, {
      hello,
      world: derivedWorld,
      title: title,
    }).expect(`<p title="ember">hello WORLD</p>`);

    // update a cell
    result
      .update(() => (hello.current = "goodbye"))
      .expect(`<p title="ember">goodbye WORLD</p>`);

    // update the input to a derived reactive value
    result
      .update(() => (world.current = "planet"))
      .expect(`<p title="ember">goodbye PLANET</p>`);

    result
      .update(() => (title.current = "ember-octane"))
      .expect(`<p title="ember-octane">goodbye PLANET</p>`);
  }

  @test "nested content"(): void {
    let compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
      title: Param<string>(),
    });

    const uppercase = (input: Var<string>): string =>
      input.current.toUpperCase();

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
          body.atom(hello);
          body.atom(constant(" "));
          body.atom(call(uppercase, world));
        }
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let title = Cell("ember");
    let derivedWorld = Derived(() => uppercase(world));

    let result = this.render(template, {
      hello,
      world: derivedWorld,
      title: title,
    }).expect(`<p title="ember">hello WORLD</p>`);

    // update a cell
    result
      .update(() => (hello.current = "goodbye"))
      .expect(`<p title="ember">goodbye WORLD</p>`);

    // update the input to a derived reactive value
    result
      .update(() => (world.current = "planet"))
      .expect(`<p title="ember">goodbye PLANET</p>`);

    result
      .update(() => (title.current = "ember-octane"))
      .expect(`<p title="ember-octane">goodbye PLANET</p>`);
  }

  @test destroyable(): void {
    const compiler = this.compiler({
      hello: Param<string>(),
      world: Param<string>(),
      showChild: Param<boolean>(),
    });

    const uppercase = (input: Var<string>): string =>
      input.current.toUpperCase();

    const program = compiler.compile((b, { hello, world, showChild }) => {
      let host = this.#owner.host;

      b.ifBlock(
        showChild,
        b => {
          b.atom(hello);
          b.atom(constant(" "));
          b.atom(world);
          b.atom(
            effect(
              {
                initialize: hello => {
                  host.log(LogLevel.Testing, `initializing ${hello.current}`);
                  return hello;
                },
                update: (hello: Var<string>) =>
                  host.log(LogLevel.Testing, `updating ${hello.current}`),
                destroy: () => host.log(LogLevel.Testing, "destroying"),
              },
              hello
            )
          );
        },
        b => {
          b.atom(call(uppercase, hello));
        }
      );
    });

    // create our input state
    let hello = Cell("hello");
    let world = Cell("world");
    let derivedWorld = Derived(() => uppercase(world));
    let showChild = Cell(true);

    let result = this.render(program, {
      hello,
      world: derivedWorld,
      showChild,
    })
      .expect("hello WORLD")
      .messages("initializing hello");

    // update a cell, but don't change the block itself
    result
      .update(() => (hello.current = "goodbye"))
      .expect("goodbye WORLD")
      .messages("updating goodbye");

    // update the input to a derived reactive value, but don't change
    // the block itself. since the effect didn't use `world`, it won't
    // run again
    result
      .update(() => (world.current = "planet"))
      .expect("goodbye PLANET")
      .messages();

    // update the condition to blow away the block; the child block
    // doesn't have the effect inside, so we shouldn't see a new
    // `initializing` message
    result
      .update(() => (showChild.current = false))
      .expect("GOODBYE")
      .messages("destroying");

    result
      .update(() => (hello.current = "hello"))
      .expect("HELLO")
      .messages();
  }

  private compiler<I extends ReactiveInputs<Dict<ReactiveParameter>>>(
    inputs: I
  ): Compiler<
    DomCursor,
    DomAtom,
    DefaultDomAtom,
    ReactiveParametersForInputs<I>
  > {
    return this.#owner.instantiate(Compiler.for, inputs, new CompileDomOps());
  }

  private render<A extends Dict<Var>>(
    program: CompiledProgram<DomCursor, DomAtom, ReactiveParameters>,
    state: A
  ): RenderExpectation {
    return sourceFrame(() => {
      let doc = createDocument();
      let parent = doc.createElement("div");
      let root = program.render(
        state,
        this.#owner.instantiate(AppendingDomRange.appending, parent)
      );
      let expectation = new RenderExpectation(
        root,
        parent,
        this.#testMessages,
        this.assert
      );
      return expectation;
    }, caller(PARENT));
  }
}

class RenderExpectation {
  #invocation: RootBlock<DomCursor, DomAtom>;
  #element: SimpleElement;
  #assert: qunit.Assert;
  #messages: string[];

  constructor(
    invocation: RootBlock<DomCursor, DomAtom>,
    element: SimpleElement,
    messages: string[],
    assert: qunit.Assert
  ) {
    this.#invocation = invocation;
    this.#element = element;
    this.#messages = messages;
    this.#assert = assert;
  }

  expect(expected: string): this {
    assertHTML(this.#assert, this.#element, expected);

    this.rerender(expected);

    return this;
  }

  private rerender(expected: string): void {
    this.#invocation.rerender();

    assertHTML(this.#assert, this.#element, expected, "no-op rerender");
  }

  messages(...expected: string[]): this {
    this.#assert.deepEqual(this.#messages, expected);
    this.#messages.length = 0;
    return this;
  }

  update(callback: () => void): UpdateExpectation {
    callback();
    this.#invocation.rerender();
    return new UpdateExpectation(this.#assert, this.#messages, this.#element);
  }
}

class UpdateExpectation {
  #assert: qunit.Assert;
  #messages: string[];
  #element: SimpleElement;

  constructor(
    assert: qunit.Assert,
    messages: string[],
    element: SimpleElement
  ) {
    this.#assert = assert;
    this.#messages = messages;
    this.#element = element;
  }

  expect(expected: string): this {
    assertHTML(this.#assert, this.#element, expected);

    return this;
  }

  messages(...expected: string[]): this {
    this.#assert.deepEqual(this.#messages, expected);
    this.#messages.length = 0;
    return this;
  }
}

function assertHTML(
  assert: qunit.Assert,
  element: SimpleElement,
  expected: string,
  message: string = `HTML: ${expected}`
): void {
  let actual = new HTMLSerializer(voidMap).serializeChildren(element);
  assert.equal(actual, expected, message);
}
