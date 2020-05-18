import {
  block,
  DEBUG,
  DebugFields,
  description,
  LogLevel,
  newtype,
  struct,
  Structured,
  Source,
} from "./debug/index";
import {
  Block,
  Host,
  Operations,
  ReactiveRange,
  RENDER,
  UserBlock,
} from "./interfaces";
import type { Region } from "./region";
import { createCache, getValue, isConst, TrackedCache } from "./polyfill";
import { POLL } from "./unsafe";
import type { Updater } from "./update";
import type { Var } from "./value";

export class ConditionBlock<Ops extends Operations> implements Block<Ops> {
  #condition: Var<boolean>;
  #then: StaticBlock<Ops>;
  #otherwise: StaticBlock<Ops>;
  #source: Source;

  constructor(
    condition: Var<boolean>,
    then: StaticBlock<Ops>,
    otherwise: StaticBlock<Ops>,
    source: Source
  ) {
    this.#condition = condition;
    this.#then = then;
    this.#otherwise = otherwise;
    this.#source = source;
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
      source: this.#source,
    });
  }

  [RENDER](output: Region<Ops>, host: Host): void {
    output.updateWith(
      dynamic(
        block<Ops>(output => {
          let isTrue = this.#condition.current;

          let next = isTrue ? this.#then : this.#otherwise;
          invokeBlock(next, output, host);
        }, this.#source),
        output
      )
    );
  }
}

export function dynamic<Ops extends Operations>(
  userBlock: UserBlock<Ops>,
  output: Region<Ops>
): DynamicBlock {
  let range: ReactiveRange<Ops> | undefined = undefined;

  return DynamicBlock.initialize(() => {
    range = output.renderDynamic(userBlock, range);
  });
}

class DynamicBlock implements Updater {
  static initialize(render: () => void): DynamicBlock {
    let cache = createCache(render);
    getValue(cache);
    return new DynamicBlock(cache);
  }

  #cache: TrackedCache<void>;

  constructor(cache: TrackedCache<void>) {
    this.#cache = cache;
  }

  [POLL](): void | Updater {
    getValue(this.#cache);

    if (isConst(this.#cache)) {
      return;
    } else {
      return this;
    }
  }

  get debugFields(): DebugFields | undefined {
    return new DebugFields("Dynamic", {
      cache: this.#cache,
    });
  }

  [DEBUG](): Structured {
    return description("Dynamic");
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
    return newtype("StaticBlock", this.#userBlock.source);
  }

  [RENDER](output: Region<Ops>): void {
    output.renderStatic(this.#userBlock);
  }
}

export function invokeBlock<Ops extends Operations>(
  block: Block<Ops>,
  output: Region<Ops>,
  host: Host
): void {
  let level = LogLevel.Info;

  host.context(level, block, () => block[RENDER](output, host));
}
