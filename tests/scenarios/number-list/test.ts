import type * as qunit from "qunit";
import {
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
  RegionAppender,
} from "reactive-prototype";
import { host, module, test } from "../../helpers";
import { ArrayCursor, num, NumberArrayOps, NumberListOutput } from "./output";

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

  @test blocks(): void {
    const ARGS = args({
      "positive.first": Reactive<number>(),
      "positive.second": Reactive<number>(),
      "positive.third": Reactive<number>(),
      "positive.sum": Reactive<number>(),
      "negative.first": Reactive<number>(),
      "negative.second": Reactive<number>(),
      "negative.third": Reactive<number>(),
      "negative.sum": Reactive<number>(),
      showPositive: Reactive<boolean>(),
      showAbs: Reactive<boolean>(),
    });

    const positiveSum = annotate(
      (
        first: ReactiveValue<number>,
        second: ReactiveValue<number>,
        third: ReactiveValue<number>
      ): number => first.value + second.value + third.value
    );

    const negativeSum = annotate(
      (
        first: ReactiveValue<number>,
        second: ReactiveValue<number>,
        third: ReactiveValue<number>
      ): number =>
        Math.abs(first.value) + Math.abs(second.value) + Math.abs(third.value)
    );

    const abs = annotate((num: ReactiveValue<number>): number =>
      Math.abs(num.value)
    );

    const template = program<NumberArrayOps>(ARGS, b => {
      b.ifBlock(
        ARGS.get("showPositive"),
        annotate(b => {
          b.ifBlock(
            ARGS.get("showAbs"),
            annotate(b => {
              b.leaf(num(ARGS.call(abs, ARGS.get("positive.first"))));
              b.leaf(num(ARGS.call(abs, ARGS.get("positive.second"))));
              b.leaf(num(ARGS.call(abs, ARGS.get("positive.third"))));
              b.leaf(num(ARGS.call(abs, ARGS.get("positive.sum"))));
            }),
            annotate(b => {
              b.leaf(num(ARGS.get("positive.first")));
              b.leaf(num(ARGS.get("positive.second")));
              b.leaf(num(ARGS.get("positive.third")));
              b.leaf(num(ARGS.get("positive.sum")));
            })
          );
        }),
        annotate(b => {
          b.ifBlock(
            ARGS.get("showAbs"),
            annotate(b => {
              b.leaf(num(ARGS.call(abs, ARGS.get("negative.first"))));
              b.leaf(num(ARGS.call(abs, ARGS.get("negative.second"))));
              b.leaf(num(ARGS.call(abs, ARGS.get("negative.third"))));
              b.leaf(num(ARGS.call(abs, ARGS.get("negative.sum"))));
            }),
            annotate(b => {
              b.leaf(num(ARGS.get("negative.first")));
              b.leaf(num(ARGS.get("negative.second")));
              b.leaf(num(ARGS.get("negative.third")));
              b.leaf(num(ARGS.get("negative.sum")));
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
      firstPos.value = 15;
      thirdPos.value = 50;
    }, [15, 20, 50, 85]);

    result.update(() => {
      showPositive.value = false;
    }, [-10, -20, -30, 60]);

    result.update(() => {
      showAbs.value = true;
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

  private render<A extends Dict<ReactiveValue>>(
    template: (state: ReactiveState) => Evaluate<NumberArrayOps>,
    state: ReactiveState<A>
  ): RenderExpectation {
    this.assert.step("initial render");
    const render = template(state);

    let { list, output } = this.context();
    let root = new RootBlock(render, output, this.#host);
    root.render(ArrayCursor.from(list, this.#host));
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
