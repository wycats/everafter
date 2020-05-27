import {
  description,
  LogLevel,
  printStructured,
  getSource,
  maybeGetSource,
  getSourceFrame,
  NO_SOURCE,
} from "./debug/index";
import { initializeEffect } from "./effect";
import type { Block, BlockFunction, RenderResult } from "./interfaces";
import { getOwner } from "./owner";
import { createCache, getValue } from "./polyfill";
import type { Region } from "./region";
import type { Var } from "./value";

export function conditionBlock<Cursor, Atom>(
  condition: Var<boolean>,
  then: Block<Cursor, Atom>,
  otherwise: Block<Cursor, Atom>
): Block<Cursor, Atom> {
  return (region: Region<Cursor, Atom>): void => {
    let currentResult: RenderResult<Cursor, Atom> | undefined = undefined;
    let currentBlock: Block<Cursor, Atom> | undefined = undefined;
    let owner = getOwner(region);
    let host = owner.host;
    let source = getSourceFrame().or(NO_SOURCE.describe("if"));

    let render = createCache(() => {
      let isTrue = condition.current;
      let nextBlock = isTrue ? then : otherwise;

      if (currentResult) {
        if (currentBlock === nextBlock) {
          host.logResult(LogLevel.Info, `stable block, updating contents`);
          currentResult.rerender();
        } else {
          host.logResult(LogLevel.Info, `unstable block, re-rendering`);
          currentResult = currentResult.replace(nextBlock);
        }
      } else {
        currentResult = region.renderDynamic(nextBlock);
        host.logResult(LogLevel.Info, printStructured(currentResult, true));
      }

      currentBlock = nextBlock;
    });

    let updater = getOwner(region).instantiate(
      initializeEffect,
      () => getValue(render),
      source
    );

    region.updateWith(updater);
  };
}

export function staticBlock<Cursor, Atom>(
  block: BlockFunction<Cursor, Atom>
): Block<Cursor, Atom> {
  return (region: Region<Cursor, Atom>): void => {
    block(region);
  };
}

export function invokeBlock<Cursor, Atom>(
  block: Block<Cursor, Atom>,
  region: Region<Cursor, Atom>
): void {
  let level = LogLevel.Info;

  if (maybeGetSource(block)) {
    getOwner(region).host.context(
      level,
      getSource(block).withDefaultDescription("Block"),
      () => block(region)
    );
  } else {
    block(region);
  }
}
