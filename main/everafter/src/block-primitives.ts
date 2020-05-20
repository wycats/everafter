import {
  block,
  DEBUG,
  description,
  LogLevel,
  newtype,
  struct,
  Structured,
  Source,
  getSource,
} from "./debug/index";
import type { Block, Host, ReactiveRange, UserBlock } from "./interfaces";
import type { Region } from "./region";
import { createCache, getValue, isConst, TrackedCache } from "./polyfill";
import { POLL } from "./unsafe";
import type { Updater } from "./update";
import type { Var } from "./value";

export class ConditionBlock<Cursor, Atom> implements Block<Cursor, Atom> {
  #condition: Var<boolean>;
  #then: StaticBlock<Cursor, Atom>;
  #otherwise: StaticBlock<Cursor, Atom>;
  #source: Source;

  constructor(
    condition: Var<boolean>,
    then: StaticBlock<Cursor, Atom>,
    otherwise: StaticBlock<Cursor, Atom>,
    source: Source
  ) {
    this.#condition = condition;
    this.#then = then;
    this.#otherwise = otherwise;
    this.#source = source;
  }

  [DEBUG](): Structured {
    return struct("Conditional", {
      then: this.#then,
      else: this.#otherwise,
    });
  }

  render(output: Region<Cursor, Atom>, host: Host): void {
    output.updateWith(
      dynamic(
        block<Cursor, Atom>(output => {
          let isTrue = this.#condition.current;

          let next = isTrue ? this.#then : this.#otherwise;
          invokeBlock(next, output, host);
        }, this.#source),
        output
      )
    );
  }
}

export function dynamic<Cursor, Atom>(
  userBlock: UserBlock<Cursor, Atom>,
  output: Region<Cursor, Atom>
): DynamicBlock {
  let range: ReactiveRange<Cursor, Atom> | undefined = undefined;

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

  poll(): void | Updater {
    getValue(this.#cache);

    if (isConst(this.#cache)) {
      return;
    } else {
      return this;
    }
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
export class StaticBlock<Cursor, Atom> implements Block<Cursor, Atom> {
  #userBlock: UserBlock<Cursor, Atom>;

  constructor(invoke: UserBlock<Cursor, Atom>) {
    this.#userBlock = invoke;
  }

  [DEBUG](): Structured {
    return newtype("StaticBlock", getSource(this.#userBlock));
  }

  render(output: Region<Cursor, Atom>): void {
    output.renderStatic(this.#userBlock);
  }
}

export function invokeBlock<Cursor, Atom>(
  block: Block<Cursor, Atom>,
  output: Region<Cursor, Atom>,
  host: Host
): void {
  let level = LogLevel.Info;

  host.context(level, block, () => block.render(output, host));
}
