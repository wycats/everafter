import { annotate, LogLevel, Source, printStructured } from "./debug/index";
import { initializeEffect } from "./effect";
import type { Block, BlockFunction, Host, RenderResult } from "./interfaces";
import type { Region } from "./region";
import type { Var } from "./value";
import { createCache, getValue } from "./polyfill";
import { poll } from "./update";

export function conditionBlock<Cursor, Atom>(
  condition: Var<boolean>,
  then: Block<Cursor, Atom>,
  otherwise: Block<Cursor, Atom>,
  source: Source
): Block<Cursor, Atom> {
  return annotate((region: Region<Cursor, Atom>): void => {
    let currentResult: RenderResult<Cursor, Atom> | undefined = undefined;
    let currentBlock: Block<Cursor, Atom> | undefined = undefined;
    let host = region.host;

    let render = createCache(() => {
      host.context(LogLevel.Info, source.withDefaultDescription(`if`), () => {
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
          currentResult = region.renderDynamic(nextBlock, source);
          host.logResult(LogLevel.Info, printStructured(currentResult, true));
        }

        currentBlock = nextBlock;
      });
    }, source);

    let updater = initializeEffect(
      annotate(() => getValue(render), source),
      host,
      source
    );

    region.updateWith(updater);
  }, source);
}

export function staticBlock<Cursor, Atom>(
  block: BlockFunction<Cursor, Atom>,
  source: Source
): Block<Cursor, Atom> {
  return annotate((region: Region<Cursor, Atom>): void => {
    block(region);
  }, source);
}

export function invokeBlock<Cursor, Atom>(
  block: Block<Cursor, Atom>,
  region: Region<Cursor, Atom>
): void {
  let level = LogLevel.Info;

  region.host.context(level, block, () => block(region));
}
