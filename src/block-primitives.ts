// eslint-disable-next-line import/no-cycle
import { DynamicBlock, invokeBlock } from "./block-internals";
import {
  DEBUG,
  DebugFields,
  internalBlock,
  newtype,
  struct,
  Structured,
} from "./debug";
import { Block, Host, RENDER, UserBlock } from "./interfaces";
import type { Operations } from "./ops";
// eslint-disable-next-line import/no-cycle
import type { Output } from "./output";
// eslint-disable-next-line import/no-cycle
import { Updater, toUpdater } from "./update";
import type { ReactiveValue } from "./value";
// eslint-disable-next-line import/no-cycle

export class ConditionBlock<Ops extends Operations> implements Block<Ops> {
  #condition: ReactiveValue<boolean>;
  #then: StaticBlock<Ops>;
  #otherwise: StaticBlock<Ops>;

  constructor(
    condition: ReactiveValue<boolean>,
    then: StaticBlock<Ops>,
    otherwise: StaticBlock<Ops>
  ) {
    this.#condition = condition;
    this.#then = then;
    this.#otherwise = otherwise;
  }

  [DEBUG](): Structured {
    return struct(
      "Conditional",
      ["then", this.#then[DEBUG]()],
      ["else", this.#otherwise[DEBUG]()]
    );
  }

  get debugFields(): DebugFields {
    return new DebugFields("ConditionBlock", {
      condition: this.#condition,
      then: this.#then,
      otherwise: this.#otherwise,
    });
  }

  [RENDER](output: Output<Ops>, host: Host): void {
    DynamicBlock.render(
      internalBlock<Ops>(output => {
        let isTrue = this.#condition.value;

        let next = isTrue ? this.#then : this.#otherwise;
        invokeBlock(next, output, host);
      }, 3),
      output,
      host
    );
  }
}

/**
 * The contents of a `StaticBlock` can change, but the block itself will
 * never be torn down and recreated. This means that any static parts
 * of the initial output will remain in the output forever.
 */
export class StaticBlock<Ops extends Operations> implements Block<Ops> {
  #userBlock: UserBlock<Ops>;

  constructor(invoke: UserBlock<Ops>) {
    this.#userBlock = invoke;
  }

  [DEBUG](): Structured {
    return newtype("StaticBlock", this.#userBlock.desc);
  }

  [RENDER](output: Output<Ops>, host: Host): void {
    let updaters: Updater[] = [];
    let append = output.withUpdaters(updaters);

    this.#userBlock.invoke(append, append.getInner(), host);

    output.updateWith(toUpdater(updaters));
  }
}
