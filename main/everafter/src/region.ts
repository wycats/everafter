import { invokeBlock } from "./block-primitives";
import type { CursorAdapter } from "./builder";
import {
  caller,
  DEBUG,
  getSource,
  LogLevel,
  PARENT,
  printStructured,
  Source,
} from "./debug/index";
import {
  AppendingReactiveRange,
  Block,
  BlockFunction,
  clearRange,
  ReactiveRange,
  RenderResult,
} from "./interfaces";
import { associateDestroyableChild, linkResource } from "./polyfill";
import { poll, Updater, updaters, UpdaterThunk } from "./update";
import { Owner, Owned, getOwner, factory } from "./owner";

/**
 * A {@link Region} is created for each area of the output. The {@link Region}
 * inserts the content into a cursor, and produces a set of updaters that will
 * be run whenever inputs to the region have changed.
 */
export class Region<Cursor, Atom> extends Owned {
  static render<Cursor, Atom>(
    owner: Owner,
    block: Block<Cursor, Atom>,
    appender: AppendingReactiveRange<Cursor, Atom>
  ): Updater | void {
    let region = owner.instantiate(() => new Region(owner, appender));
    block(region);

    if (region.#updaters.length === 0) {
      return;
    } else {
      return updaters(region.#updaters, getOwner(region), getSource(block));
    }
  }

  #range: AppendingReactiveRange<Cursor, Atom>;
  #updaters: Updater[];
  #destroyers: object = Object.freeze(Object.create(null));

  constructor(
    owner: Owner,
    range: AppendingReactiveRange<Cursor, Atom>,
    updaters: Updater[] = []
  ) {
    super(owner);
    if (range instanceof Region) {
      throw new Error(`assert: can't wrap TrackedOutput around TrackedOutput`);
    }

    this.#range = range;
    this.#updaters = updaters;
  }

  atom(reactiveAtom: Atom, source = caller(PARENT)): void {
    this.updateWith(this.#range.append(reactiveAtom, source));
  }

  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<
      AppendingReactiveRange<Cursor, Atom>,
      AppendingReactiveRange<ChildCursor, ChildAtom>
    >
  ): Region<ChildCursor, ChildAtom> {
    let appender = adapter.child(this.#range.child());
    return getOwner(this).instantiate(RegionFactory, appender, this.#updaters);
  }

  flush<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<
      AppendingReactiveRange<Cursor, Atom>,
      AppendingReactiveRange<ChildCursor, ChildAtom>
    >,
    child: Region<ChildCursor, ChildAtom>
  ): Region<Cursor, Atom> {
    let appender = adapter.flush(
      this.#range,
      finalizeRange(child.#range, child.#destroyers)
    );

    return getOwner(this).instantiate(RegionFactory, appender, this.#updaters);
  }

  /**
   * Add an {@link Updater} to the list of updaters for the current region.
   *
   * When the output is updated, each of the updaters will be polled.
   *
   * @internal
   */
  updateWith(updater: Updater | void): void {
    if (updater !== undefined) {
      let host = getOwner(updater).host;

      host.logResult(
        LogLevel.Info,
        `${printStructured(updater, true)}`,
        "color: green"
      );
      linkResource(this.#destroyers, updater);
      this.#updaters.push(updater);
    }
  }

  /**
   * @internal
   */
  finalize(source: Source): RenderResult<Cursor, Atom> {
    let range = finalizeRange(this.#range, this.#destroyers);
    let updater = updaters(this.#updaters, getOwner(this), source);

    return result(updater, range, source);
  }

  /**
   * A dynamic block is rendered once every time the inputs into the block
   * change. It returns a {@link RenderResult} that can be used to update
   * the block or replace the block with another block.
   *
   * @internal
   */
  renderDynamic(block: Block<Cursor, Atom>): RenderResult<Cursor, Atom> {
    let region = getOwner(this).instantiate(RegionFactory, this.#range.child());
    invokeBlock(block, region);

    return region.finalize(getSource(block));
  }

  /**
   * @internal
   */
  renderBlock(block: Block<Cursor, Atom>): void {
    let child = getOwner(this).instantiate(
      RegionFactory,
      this.#range,
      this.#updaters
    );

    invokeBlock(block, child);
  }
}

export const RegionFactory = factory(Region);

function result<Cursor, Atom>(
  update: Updater,
  range: ReactiveRange<Cursor, Atom>,
  source: Source
): RenderResult<Cursor, Atom> {
  return {
    [DEBUG]: () => {
      return source[DEBUG]();
    },

    rerender: () => {
      poll(update);
    },

    replace: (newBlock: Block<Cursor, Atom>) => {
      let owner = getOwner(update);
      let region = owner.instantiate(RegionFactory, clearRange(range));
      newBlock(region);
      return region.finalize(source);
    },
  };
}

function finalizeRange<Cursor, Atom>(
  appendingRange: AppendingReactiveRange<Cursor, Atom>,
  destroyers: object
): ReactiveRange<Cursor, Atom> {
  let range = appendingRange.finalize();
  associateDestroyableChild(range, destroyers);
  return range;
}
