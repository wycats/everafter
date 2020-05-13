// eslint-disable-next-line import/no-cycle
import { DynamicBlock, render } from "./block-internals";
import {
  AbstractOutput,
  UserBlock,
  Block,
  Host,
  RENDER,
  logUpdaters,
} from "./interfaces";
import type { Operations } from "./ops";
// eslint-disable-next-line import/no-cycle
import { Output } from "./output";
import {
  pollUpdaters,
  PresentUpdaters,
  toPresentUpdaters,
  Updater,
  POLL,
} from "./update";
import {
  DebugFields,
  DEBUG,
  newtype,
  Structured,
  internalBlock,
  struct,
} from "./debug";
import type { ReactiveValue } from "./value";

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

  [RENDER](output: AbstractOutput<Ops>, host: Host): Updater | void {
    return DynamicBlock.render(
      internalBlock<Ops>((_output, inner) => {
        let isTrue = this.#condition.value;

        let next = isTrue ? this.#then : this.#otherwise;
        render(next, inner, host);
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

  [RENDER](output: AbstractOutput<Ops>, host: Host): Updater | void {
    let updaters: Updater[] = [];
    let append = new Output(output, updaters, host);

    this.#userBlock.invoke(append, output);

    logUpdaters(updaters, host);

    let presentUpdaters = toPresentUpdaters(updaters);

    if (presentUpdaters) {
      return new StaticBlockResult(presentUpdaters);
    }
  }
}

export class StaticBlockResult implements Updater {
  // The updaters that should be polled when this result is polled and
  // `#freshness` is not stale.
  #updaters: readonly [Updater, ...Updater[]];

  constructor(updaters: PresentUpdaters) {
    this.#updaters = updaters;
  }

  [DEBUG](): Structured {
    return struct("StaticBlockResult", ["updaters", this.#updaters]);
  }

  get debugFields(): DebugFields {
    return new DebugFields("BlockResult", {
      updaters: this.#updaters,
    });
  }

  [POLL](host: Host): Updater | void {
    let updaters = pollUpdaters(this.#updaters, host);

    if (updaters) {
      return new StaticBlockResult(updaters);
    }
  }
}
