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
  annotate,
} from "./debug/index";
import type { Host, ReactiveRange, Block, BlockFunction } from "./interfaces";
import type { Region } from "./region";
import { createCache, getValue, isConst, TrackedCache } from "./polyfill";
import type { Updater } from "./update";
import type { Var } from "./value";

export function conditionBlock<Cursor, Atom>(
  condition: Var<boolean>,
  then: Block<Cursor, Atom>,
  otherwise: Block<Cursor, Atom>,
  source: Source
): Block<Cursor, Atom> {
  return annotate((output: Region<Cursor, Atom>, host: Host): void => {
    let range: ReactiveRange<Cursor, Atom> | undefined = undefined;

    let cache = createCache(() => {
      range = output.renderDynamic((region: Region<Cursor, Atom>) => {
        let isTrue = condition.current;

        let next = isTrue ? then : otherwise;
        invokeBlock(next, region, host);
      }, range);
    });

    getValue(cache);
    let dyn = new DynamicBlock(cache);

    output.updateWith(dyn);
  }, source);
}

class DynamicBlock implements Updater {
  #cache: TrackedCache<void>;

  constructor(cache: TrackedCache<void>) {
    this.#cache = cache;
  }

  poll(): "const" | "dynamic" {
    getValue(this.#cache);

    if (isConst(this.#cache)) {
      return "const";
    } else {
      return "dynamic";
    }
  }

  [DEBUG](): Structured {
    return description("DynamicBlock");
  }
}

export function staticBlock<Cursor, Atom>(
  block: BlockFunction<Cursor, Atom>,
  source: Source
): Block<Cursor, Atom> {
  return annotate((region: Region<Cursor, Atom>): void => {
    region.renderStatic(block);
  }, source);
}

export function invokeBlock<Cursor, Atom>(
  block: Block<Cursor, Atom>,
  output: Region<Cursor, Atom>,
  host: Host
): void {
  let level = LogLevel.Info;

  host.context(level, block, () => block(output, host));
}
