import type * as qunit from "qunit";
import {
  Cell,
  Derived,
  Output,
  ReactiveValue,
  RootBlock,
} from "reactive-prototype";
import { module, test } from "../../helpers";
import { ArrayCursor, NumberArrayOps, NumberListOutput } from "./output";

@module("list of numbers")
export class ListOfNumbersTest {
  declare assert: qunit.Assert;

  @test "simple number list"(): void {
    const output: number[] = [];

    const cells = {
      first: Cell(10),
      second: Cell(20),
      third: Cell(30),
    };

    const derived = Derived(
      () => cells.first.value + cells.second.value + cells.third.value
    );

    const ARGS = {
      ...cells,
      last: derived,
    };

    let Render = (args: typeof ARGS, output: Output<NumberArrayOps>): void => {
      output.leaf(args.first);
      output.leaf(args.second);
      output.leaf(args.third);
      output.leaf(args.last);
    };

    let renderer = new RootBlock(
      Render,
      ARGS,
      cursor => new NumberListOutput(output, cursor)
    );

    renderer.render(ArrayCursor.from(output));

    this.assert.deepEqual(output, [10, 20, 30, 60], "[10, 20, 30, 60]");

    cells.first.value = 15;
    cells.third.value = 50;

    renderer.rerender();

    this.assert.deepEqual(output, [15, 20, 50, 85], "[15, 20, 50, 85]");
  }

  @test blocks(): void {
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

    const Render = (
      args: typeof ARGS,
      output: Output<NumberArrayOps>
    ): void => {
      output.ifBlock(
        args.showPositive,
        output => {
          output.ifBlock(
            args.showAbs,
            output => {
              output.leaf(abs(args.positive.first));
              output.leaf(abs(args.positive.second));
              output.leaf(abs(args.positive.third));
              output.leaf(abs(derivedPositive));
            },
            output => {
              output.leaf(args.positive.first);
              output.leaf(args.positive.second);
              output.leaf(args.positive.third);
              output.leaf(derivedPositive);
            }
          );
        },
        output => {
          output.ifBlock(
            args.showAbs,
            output => {
              output.leaf(abs(args.negative.first));
              output.leaf(abs(args.negative.second));
              output.leaf(abs(args.negative.third));
              output.leaf(abs(derivedNegative));
            },
            output => {
              output.leaf(args.negative.first);
              output.leaf(args.negative.second);
              output.leaf(args.negative.third);
              output.leaf(derivedNegative);
            }
          );
        }
      );
    };

    let renderer = new RootBlock(
      Render,
      ARGS,
      pos => new NumberListOutput(output, pos)
    );

    renderer.render(ArrayCursor.from(output));

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
}
