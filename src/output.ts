import type { Operations } from "./ops";
import type { ReactiveValue } from "./value";
import type { AbstractOutput, UserBlock, BlockBuffer } from "./interfaces";
import { updating, Updater } from "./update";
// eslint-disable-next-line import/no-cycle
import { DynamicBlock, StaticBlock } from "./block";

/**
 * The concrete object that gets passed into user blocks.
 */
export class Output<Ops extends Operations> {
  #inner: AbstractOutput<Ops>;
  #updates: Updater[];

  constructor(inner: AbstractOutput<Ops>, updates: Updater[]) {
    if (inner instanceof Output) {
      throw new Error(`assert: can't wrap TrackedOutput around TrackedOutput`);
    }

    this.#inner = inner;
    this.#updates = updates;
  }

  private updateWith(update: Updater | void): void {
    if (update) {
      this.#updates.push(update);
    }
  }

  getChild(): AbstractOutput<Ops> {
    let Output = this.#inner.getOutput();
    return Output(this.#inner.getCursor());
  }

  leaf(leaf: Ops["leafKind"]): void {
    this.updateWith(updating(() => this.#inner.appendLeaf(leaf)));
  }

  /**
   * @param condition a reactive boolean
   * @param then a user block
   * @param otherwise a user block
   */
  ifBlock(
    condition: ReactiveValue<boolean>,
    then: UserBlock<Ops>,
    otherwise: UserBlock<Ops>
  ): void {
    // let output = this.#inner.getChild();
    let block: UserBlock<Ops> = (output: Output<Ops>): void => {
      let isTrue = condition.value;
      let next = isTrue ? then : otherwise;
      next(output);
    };

    let assertion = new DynamicBlock(block);

    let result = assertion.render(this.getChild());

    this.updateWith(result);
  }

  open<B extends Ops["blockKind"]>(value: B["open"]): BlockBuffer<Ops, B> {
    return this.#inner.openBlock(value);
  }
}
