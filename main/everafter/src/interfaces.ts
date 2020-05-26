import type { CompilableAtom } from "./builder";
import type { Debuggable } from "./debug/index";
import type { Factory, Owned } from "./owner";
import { destroy } from "./polyfill";
import type { Region } from "./region";
import type { Updater } from "./update";

export interface CompileOperations<Cursor, Atom, DefaultAtom> {
  defaultAtom(atom: DefaultAtom): Factory<CompilableAtom<Cursor, Atom>>;
}

export interface RenderResult<Cursor, Atom> extends Debuggable {
  rerender(): void;
  replace(block: Block<Cursor, Atom>): RenderResult<Cursor, Atom>;
}

/**
 * A {@link ReactiveRange} is the main way that Reactive Prototype manages dynamic
 * areas of the output that might need to be removed later.
 *
 * {@link ReactiveRange} is responsible for doing whatever bookkeeping it needs to
 * do to be able to remove the relevant atoms from the output without breaking other
 * active {@link ReactiveRange}s.
 *
 * Cursors, on the other hand, are never retained by Reactive Prototype, so ranges
 * are not responsible for maintaining the bookkeeping of cursors.
 *
 * @see {RegionAppender::range}
 */
export interface ReactiveRange<Cursor, ReactiveAtom> extends Debuggable, Owned {
  /**
   * When a reactive range is cleared, all of its contents are removed from
   * the output, and a new cursor is created for new content.
   */
  clears(): AppendingReactiveRange<Cursor, ReactiveAtom>;
}

export function clearRange<Cursor, ReactiveAtom>(
  range: ReactiveRange<Cursor, ReactiveAtom>
): AppendingReactiveRange<Cursor, ReactiveAtom> {
  let appendingRange = range.clears();
  destroy(range);
  return appendingRange;
}

export interface AppendingReactiveRange<Cursor, ReactiveAtom>
  extends Debuggable,
    Owned {
  append(atom: ReactiveAtom): Updater;
  getCursor(): Cursor;
  child(): AppendingReactiveRange<Cursor, ReactiveAtom>;
  finalize(): ReactiveRange<Cursor, ReactiveAtom>;
}

export type BlockFunction<Cursor, Atom> = (
  output: Region<Cursor, Atom>
) => void;

export type Block<Cursor, Atom> = BlockFunction<Cursor, Atom>;

export const RENDER = Symbol("RENDER");
