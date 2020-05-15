import type * as qunit from "qunit";
import {
  annotate,
  block,
  Cell,
  Derived,
  Output,
  ReactiveValue,
  RootBlock,
  Reactive,
  args,
  program,
  Dict,
  ReactiveState,
  Evaluate,
  callerFrame,
  PARENT,
  AbstractOutput,
} from "reactive-prototype";
import { host, module, test, todo } from "../../helpers";
import { ArrayCursor, NumberArrayOps, NumberListOutput, num } from "./output";

@module("list of numbers")
export class ListOfNumbersTest {
  declare assert: qunit.Assert;

  #host = host();

  @test "simple number list"(): void {
    const ARGS = args({
      first: Reactive<number>(),
      second: Reactive<number>(),
      third: Reactive<number>(),
      sum: Reactive<number>(),
    });

    const sum = annotate(
      (
        first: ReactiveValue<number>,
        second: ReactiveValue<number>,
        third: ReactiveValue<number>
      ): number => first.value + second.value + third.value
    );

    const template = program<NumberArrayOps>(ARGS, b => {
      b.leaf(num(ARGS.get("first")));
      b.leaf(num(ARGS.get("second")));
      b.leaf(num(ARGS.get("third")));
      b.leaf(num(ARGS.get("sum")));
    });

    const first = Cell(10);
    const second = Cell(20);
    const third = Cell(30);

    const state = ARGS.hydrate({
      first,
      second,
      third,
      sum: Derived(() => sum.f(first, second, third)),
    });

    let result = this.render(template, state).expect([10, 20, 30, 60]);

    result.rerender();

    result.update(() => {
      first.value = 15;
      third.value = 50;
    }, [15, 20, 50, 85]);
  }

  @todo blocks(): void {
    const output: number[] = [];

    const positiveCells = {
      first: Cell(10),
      second: Cell(20),
      third: Cell(30),
    };

    const derivedPositive = Derived(
      () =>
        positiveCells.first.value +
        positiveCells.second.value +
        positiveCells.third.value
    );

    const negativeCells = {
      first: Cell(-10),
      second: Cell(-20),
      third: Cell(-30),
    };

    const derivedNegative = Derived(
      () =>
        Math.abs(negativeCells.first.value) +
        Math.abs(negativeCells.second.value) +
        Math.abs(negativeCells.third.value)
    );

    const ARGS = {
      positive: positiveCells,
      derivedPositive,
      negative: negativeCells,
      derivedNegative,
      showPositive: Cell(true),
      showAbs: Cell(false),
    };

    function abs(num: ReactiveValue<number>): ReactiveValue<number> {
      return Derived(() => {
        let value = num.value;
        return Math.abs(value);
      });
    }

    const Render = annotate(
      (args: typeof ARGS, output: Output<NumberArrayOps>): void => {
        output.ifBlock(
          args.showPositive,
          block(output => {
            output.ifBlock(
              args.showAbs,
              block(output => {
                output.leaf(abs(args.positive.first));
                output.leaf(abs(args.positive.second));
                output.leaf(abs(args.positive.third));
                output.leaf(abs(derivedPositive));
              }),
              block(output => {
                output.leaf(args.positive.first);
                output.leaf(args.positive.second);
                output.leaf(args.positive.third);
                output.leaf(derivedPositive);
              })
            );
          }),
          block(output => {
            output.ifBlock(
              args.showAbs,
              block(output => {
                output.leaf(abs(args.negative.first));
                output.leaf(abs(args.negative.second));
                output.leaf(abs(args.negative.third));
                output.leaf(abs(derivedNegative));
              }),
              block(output => {
                output.leaf(args.negative.first);
                output.leaf(args.negative.second);
                output.leaf(args.negative.third);
                output.leaf(derivedNegative);
              })
            );
          })
        );
      }
    );

    let renderer = new RootBlock(
      Render,
      ARGS,
      pos => new NumberListOutput(output, pos, this.#host),
      this.#host
    );

    renderer.render(ArrayCursor.from(output, this.#host));

    this.assert.deepEqual(output, [10, 20, 30, 60], "[10, 20, 30, 60]");

    positiveCells.first.value = 15;
    positiveCells.third.value = 50;
    renderer.rerender();

    this.assert.deepEqual(output, [15, 20, 50, 85], "[15, 20, 50, 85]");

    ARGS.showPositive.value = false;
    renderer.rerender();
    this.assert.deepEqual(output, [-10, -20, -30, 60], "[-10, -20, -30, 60]");

    ARGS.showAbs.value = true;
    renderer.rerender();
    this.assert.deepEqual(output, [10, 20, 30, 60], "[10, 20, 30, 60]");
  }

  private context(): {
    list: number[];
    output: (cursor: ArrayCursor) => AbstractOutput<NumberArrayOps>;
  } {
    let list: number[] = [];
    let output = (cursor: ArrayCursor): NumberListOutput =>
      new NumberListOutput(list, cursor, this.#host);

    return { list, output };
  }

  private render<A extends Dict<ReactiveValue>>(
    template: (state: ReactiveState) => Evaluate<NumberArrayOps>,
    state: ReactiveState<A>
  ): RenderExpectation<A> {
    this.assert.step("initial render");
    const render = template(state);

    let { list, output } = this.context();
    let root = new RootBlock(render, output, this.#host);
    root.render(ArrayCursor.from(list, this.#host));
    return new RenderExpectation(root, list, this.assert);
  }
}

class RenderExpectation<Args extends Dict<ReactiveValue>> {
  #invocation: RootBlock<NumberArrayOps, Args>;
  #list: number[];
  #assert: qunit.Assert;
  #last: readonly number[] | undefined = undefined;

  constructor(
    invocation: RootBlock<NumberArrayOps, Args>,
    list: number[],
    assert: qunit.Assert
  ) {
    this.#invocation = invocation;
    this.#list = list;
    this.#assert = assert;
  }

  expect(expected: readonly number[]): this {
    this.assertList(expected);
    this.#assert.verifySteps(["initial render"], "initial render: done");
    return this;
  }

  rerender(): void {
    this.#assert.step("no-op rerender");
    this.#invocation.rerender(callerFrame(PARENT));

    if (this.#last === undefined) {
      throw new Error(`must render before rerendering`);
    }

    this.assertList(this.#last);
    this.#assert.verifySteps(["no-op rerender"], "no-op rerender: done");
  }

  update(callback: () => void, expected: readonly number[]): void {
    this.#assert.step("updating");
    callback();
    this.#invocation.rerender(callerFrame(PARENT));
    this.assertList(expected);
    this.#assert.verifySteps(["updating"], "updating: done");
  }

  private assertList(expected: readonly number[]): void {
    this.#last = expected;
    this.#assert.deepEqual(this.#list, expected, JSON.stringify(expected));
  }
}
