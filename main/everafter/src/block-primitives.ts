import { annotate, LogLevel, Source } from "./debug/index";
import { initializeEffect } from "./effect";
import type { Block, BlockFunction, Host, ReactiveRange } from "./interfaces";
import type { Region } from "./region";
import type { Var } from "./value";

export function conditionBlock<Cursor, Atom>(
  condition: Var<boolean>,
  then: Block<Cursor, Atom>,
  otherwise: Block<Cursor, Atom>,
  source: Source
): Block<Cursor, Atom> {
  return annotate((output: Region<Cursor, Atom>, host: Host): void => {
    let range: ReactiveRange<Cursor, Atom> | undefined = undefined;

    let updater = initializeEffect(() => {
      range = output.renderDynamic((region: Region<Cursor, Atom>) => {
        let isTrue = condition.current;

        let next = isTrue ? then : otherwise;
        invokeBlock(next, region, host);
      }, range);
    }, source);

    output.updateWith(updater);
  }, source);
}

export function staticBlock<Cursor, Atom>(
  block: BlockFunction<Cursor, Atom>,
  source: Source
): Block<Cursor, Atom> {
  return annotate((region: Region<Cursor, Atom>): void => {
    region.renderStatic(annotate(block, source));
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
