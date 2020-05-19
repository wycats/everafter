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
} from "everafter";
import { host, module, test } from "../../helpers";
import { ArrayCursor, num, NumberArrayOps, NumberListOutput } from "./output";

@module("list of numbers")
export class ListOfNumbersTest {
  declare assert: qunit.Assert;

  #host = host();

  @test "simple number list"(): void {
    const ARGS = args({
      first: Arg<number>(),
      second: Arg<number>(),
      third: Arg<number>(),
      sum: Arg<number>(),
    });

    const sum = annotate(
      (first: Var<number>, second: Var<number>, third: Var<number>): number =>
        first.current + second.current + third.current
    );

    const template = program<NumberArrayOps>(b => {
      b.atom(num(ARGS.get("first")));
      b.atom(num(ARGS.get("second")));
      b.atom(num(ARGS.get("third")));
      b.atom(num(ARGS.get("sum")));
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
      first.current = 15;
      third.current = 50;
    }, [15, 20, 50, 85]);
  }

  @test blocks(): void {
    const ARGS = args({
      "positive.first": Arg<number>(),
      "positive.second": Arg<number>(),
      "positive.third": Arg<number>(),
      "positive.sum": Arg<number>(),
      "negative.first": Arg<number>(),
      "negative.second": Arg<number>(),
      "negative.third": Arg<number>(),
      "negative.sum": Arg<number>(),
      showPositive: Arg<boolean>(),
      showAbs: Arg<boolean>(),
    });

    const positiveSum = annotate(
      (first: Var<number>, second: Var<number>, third: Var<number>): number =>
        first.current + second.current + third.current
    );

    const negativeSum = annotate(
      (first: Var<number>, second: Var<number>, third: Var<number>): number =>
        Math.abs(first.current) +
        Math.abs(second.current) +
        Math.abs(third.current)
    );

    const abs = annotate((num: Var<number>): number => Math.abs(num.current));

    const template = program<NumberArrayOps>(b => {
      b.ifBlock(
        ARGS.get("showPositive"),
        annotate(b => {
          b.ifBlock(
            ARGS.get("showAbs"),
            annotate(b => {
              b.atom(num(ARGS.call(abs, ARGS.get("positive.first"))));
              b.atom(num(ARGS.call(abs, ARGS.get("positive.second"))));
              b.atom(num(ARGS.call(abs, ARGS.get("positive.third"))));
              b.atom(num(ARGS.call(abs, ARGS.get("positive.sum"))));
            }),
            annotate(b => {
              b.atom(num(ARGS.get("positive.first")));
              b.atom(num(ARGS.get("positive.second")));
              b.atom(num(ARGS.get("positive.third")));
              b.atom(num(ARGS.get("positive.sum")));
            })
          );
        }),
        annotate(b => {
          b.ifBlock(
            ARGS.get("showAbs"),
            annotate(b => {
              b.atom(num(ARGS.call(abs, ARGS.get("negative.first"))));
              b.atom(num(ARGS.call(abs, ARGS.get("negative.second"))));
              b.atom(num(ARGS.call(abs, ARGS.get("negative.third"))));
              b.atom(num(ARGS.call(abs, ARGS.get("negative.sum"))));
            }),
            annotate(b => {
              b.atom(num(ARGS.get("negative.first")));
              b.atom(num(ARGS.get("negative.second")));
              b.atom(num(ARGS.get("negative.third")));
              b.atom(num(ARGS.get("negative.sum")));
            })
          );
        })
      );
    });

    const firstPos = Cell(10);
    const secondPos = Cell(20);
    const thirdPos = Cell(30);
    const firstNeg = Cell(-10);
    const secondNeg = Cell(-20);
    const thirdNeg = Cell(-30);
    const showPositive = Cell(true);
    const showAbs = Cell(false);

    const state = ARGS.hydrate({
      "positive.first": firstPos,
      "positive.second": secondPos,
      "positive.third": thirdPos,
      "positive.sum": Derived(() =>
        positiveSum.f(firstPos, secondPos, thirdPos)
      ),
      "negative.first": firstNeg,
      "negative.second": secondNeg,
      "negative.third": thirdNeg,
      "negative.sum": Derived(() =>
        negativeSum.f(firstNeg, secondNeg, thirdNeg)
      ),
      showPositive,
      showAbs,
    });

    let result = this.render(template, state).expect([10, 20, 30, 60]);

    result.rerender();

    result.update(() => {
      firstPos.current = 15;
      thirdPos.current = 50;
    }, [15, 20, 50, 85]);

    result.update(() => {
      showPositive.current = false;
    }, [-10, -20, -30, 60]);

    result.update(() => {
      showAbs.current = true;
    }, [10, 20, 30, 60]);
  }

  private context(): {
    list: number[];
    output: (cursor: ArrayCursor) => RegionAppender<NumberArrayOps>;
  } {
    let list: number[] = [];
    let output = (cursor: ArrayCursor): NumberListOutput =>
      new NumberListOutput(list, cursor, this.#host);

    return { list, output };
  }

  private render<A extends Dict<Var>>(
    template: (state: ReactiveState) => Evaluate<NumberArrayOps>,
    state: ReactiveState<A>
  ): RenderExpectation {
    this.assert.step("initial render");
    const render = template(state);

    let { list, output } = this.context();
    let root = new RootBlock(render, output, this.#host);
    root.render(ArrayCursor.from(list, this.#host), caller(PARENT));
    return new RenderExpectation(root, list, this.assert);
  }
}

class RenderExpectation {
  #invocation: RootBlock<NumberArrayOps>;
  #list: number[];
  #assert: qunit.Assert;
  #last: readonly number[] | undefined = undefined;

  constructor(
    invocation: RootBlock<NumberArrayOps>,
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
    this.#invocation.rerender(caller(PARENT));

    if (this.#last === undefined) {
      throw new Error(`must render before rerendering`);
    }

    this.assertList(this.#last);
    this.#assert.verifySteps(["no-op rerender"], "no-op rerender: done");
  }

  update(callback: () => void, expected: readonly number[]): void {
    this.#assert.step("updating");
    callback();
    this.#invocation.rerender(caller(PARENT));
    this.assertList(expected);
    this.#assert.verifySteps(["updating"], "updating: done");
  }

  private assertList(expected: readonly number[]): void {
    this.#last = expected;
    this.#assert.deepEqual(this.#list, expected, JSON.stringify(expected));
  }
}
