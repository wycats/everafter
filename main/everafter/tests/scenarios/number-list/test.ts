import {
  call,
  caller,
  Cell,
  CompiledProgram,
  Compiler,
  Derived,
  Dict,
  Param,
  PARENT,
  ReactiveParameters,
  RootBlock,
  Var,
  sourceFrame,
} from "everafter";
import type * as qunit from "qunit";
import { owner, module, test } from "../../helpers";
import {
  ArrayAtom,
  ArrayCursor,
  ArrayRange,
  CompileNumberArrayOps,
} from "./output";

@module("list of numbers")
export class ListOfNumbersTest {
  declare assert: qunit.Assert;

  #owner = owner();

  @test "simple number list"(): void {
    const compiler = this.#owner.instantiate(
      Compiler.for,
      {
        first: Param<number>(),
        second: Param<number>(),
        third: Param<number>(),
        sum: Param<number>(),
      },
      new CompileNumberArrayOps()
    );

    const sum = (
      first: Var<number>,
      second: Var<number>,
      third: Var<number>
    ): number => first.current + second.current + third.current;

    const program = compiler.compile((p, { first, second, third, sum }) => {
      p.atom(first);
      p.atom(second);
      p.atom(third);
      p.atom(sum);
    });

    const first = Cell(10);
    const second = Cell(20);
    const third = Cell(30);

    let result = this.render(program, {
      first,
      second,
      third,
      sum: Derived(() => sum(first, second, third)),
    }).expect([10, 20, 30, 60]);

    result.rerender();

    result.update(() => {
      first.current = 15;
      third.current = 50;
    }, [15, 20, 50, 85]);
  }

  @test blocks(): void {
    const compiler = this.#owner.instantiate(
      Compiler.for,
      {
        "positive.first": Param<number>(),
        "positive.second": Param<number>(),
        "positive.third": Param<number>(),
        "positive.sum": Param<number>(),
        "negative.first": Param<number>(),
        "negative.second": Param<number>(),
        "negative.third": Param<number>(),
        "negative.sum": Param<number>(),
        showPositive: Param<boolean>(),
        showAbs: Param<boolean>(),
      },
      new CompileNumberArrayOps()
    );

    const positiveSum = (
      first: Var<number>,
      second: Var<number>,
      third: Var<number>
    ): number => first.current + second.current + third.current;

    const negativeSum = (
      first: Var<number>,
      second: Var<number>,
      third: Var<number>
    ): number =>
      Math.abs(first.current) +
      Math.abs(second.current) +
      Math.abs(third.current);

    const abs = (num: Var<number>): number => Math.abs(num.current);

    const program = compiler.compile((b, params) => {
      b.ifBlock(
        params.showPositive,
        b => {
          b.ifBlock(
            params.showAbs,
            b => {
              b.atom(call(abs, params["positive.first"]));
              b.atom(call(abs, params["positive.second"]));
              b.atom(call(abs, params["positive.third"]));
              b.atom(call(abs, params["positive.sum"]));
            },
            b => {
              b.atom(params["positive.first"]);
              b.atom(params["positive.second"]);
              b.atom(params["positive.third"]);
              b.atom(params["positive.sum"]);
            }
          );
        },
        b => {
          b.ifBlock(
            params["showAbs"],
            b => {
              b.atom(call(abs, params["negative.first"]));
              b.atom(call(abs, params["negative.second"]));
              b.atom(call(abs, params["negative.third"]));
              b.atom(call(abs, params["negative.sum"]));
            },
            b => {
              b.atom(params["negative.first"]);
              b.atom(params["negative.second"]);
              b.atom(params["negative.third"]);
              b.atom(params["negative.sum"]);
            }
          );
        }
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

    let result = this.render(program, {
      "positive.first": firstPos,
      "positive.second": secondPos,
      "positive.third": thirdPos,
      "positive.sum": Derived(() => positiveSum(firstPos, secondPos, thirdPos)),
      "negative.first": firstNeg,
      "negative.second": secondNeg,
      "negative.third": thirdNeg,
      "negative.sum": Derived(() => negativeSum(firstNeg, secondNeg, thirdNeg)),
      showPositive,
      showAbs,
    }).expect([10, 20, 30, 60]);

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

  private render<A extends Dict<Var>>(
    program: CompiledProgram<ArrayCursor, ArrayAtom, ReactiveParameters>,
    state: A
  ): RenderExpectation {
    return sourceFrame(() => {
      this.assert.step("initial render");
      let list: number[] = [];
      let root = program.render(
        state,
        this.#owner.instantiate(ArrayRange.from, list)
      );
      return new RenderExpectation(root, list, this.assert);
    }, caller(PARENT + 1));
  }
}

class RenderExpectation {
  #invocation: RootBlock<ArrayCursor, ArrayAtom>;
  #list: number[];
  #assert: qunit.Assert;
  #last: readonly number[] | undefined = undefined;

  constructor(
    invocation: RootBlock<ArrayCursor, ArrayAtom>,
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
    this.#invocation.rerender();

    if (this.#last === undefined) {
      throw new Error(`must render before rerendering`);
    }

    this.assertList(this.#last);
    this.#assert.verifySteps(["no-op rerender"], "no-op rerender: done");
  }

  update(callback: () => void, expected: readonly number[]): void {
    this.#assert.step("updating");
    callback();
    this.#invocation.rerender();
    this.assertList(expected);
    this.#assert.verifySteps(["updating"], "updating: done");
  }

  private assertList(expected: readonly number[]): void {
    this.#last = expected;
    this.#assert.deepEqual(this.#list, expected, JSON.stringify(expected));
  }
}
