import type * as qunit from "qunit";
import {
  annotate,
  block,
  Cell,
  Derived,
  Output,
  ReactiveValue,
  RootBlock,
} from "reactive-prototype";
import { host, module, test, todo } from "../../helpers";
import { ArrayCursor, NumberArrayOps, NumberListOutput } from "./output";

@module("list of numbers")
export class ListOfNumbersTest {
  declare assert: qunit.Assert;

  #host = host();

  @todo "simple number list"(): void {
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

    const Render = annotate(
      (args: typeof ARGS, output: Output<NumberArrayOps>): void => {
        output.leaf(args.first);
        output.leaf(args.second);
        output.leaf(args.third);
        output.leaf(args.last);
      }
    );

    let block = new RootBlock(
      Render,
      ARGS,
      cursor => new NumberListOutput(output, cursor, this.#host),
      this.#host
    );

    block.render(ArrayCursor.from(output, this.#host));

    this.assert.deepEqual(output, [10, 20, 30, 60], "[10, 20, 30, 60]");

    cells.first.value = 15;
    cells.third.value = 50;

    console.log("before", output);
    block.rerender();
    console.log("after", output);

    this.assert.deepEqual(output, [15, 20, 50, 85], "[15, 20, 50, 85]");
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
}
