import { invokeBlock } from "./block-primitives";
import type { CursorAdapter } from "./builder";
import { DEBUG, description, LogLevel } from "./debug/index";
import {
  AppendingReactiveRange,
  Block,
  clearRange,
  ReactiveRange,
  RenderResult,
} from "./interfaces";
import {
  getOwner,
  Owned,
  Owner,
  SUCCESS,
  IGNORE,
  INITIAL,
  group,
} from "./owner";
import { associateDestroyableChild, linkResource, isConst } from "./polyfill";
import { poll, Updater, updaters } from "./update";

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
      return updaters(region.#updaters, getOwner(region));
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

  atom(reactiveAtom: Atom): void {
    this.updateWith(this.#range.append(reactiveAtom));
  }

  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<
      AppendingReactiveRange<Cursor, Atom>,
      AppendingReactiveRange<ChildCursor, ChildAtom>
    >
  ): Region<ChildCursor, ChildAtom> {
    let appender = adapter.child(this.#range.child());
    return this.new(Region, appender, this.#updaters);
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

    return this.new(Region, appender, this.#updaters);
  }

  /**
   * Add an {@link Updater} to the list of updaters for the current region.
   *
   * When the output is updated, each of the updaters will be polled.
   *
   * @internal
   */
  updateWith(updater: Updater | void): void {
    let host = getOwner(this).host;

    if (updater === undefined || isConst(updater)) {
      host.logResult(LogLevel.Info, `static`, group(IGNORE, INITIAL));
    } else if (updater !== undefined) {
      host.logResult(LogLevel.Info, `dynamic`, group(SUCCESS, INITIAL));
      linkResource(this.#destroyers, updater);
      this.#updaters.push(updater);
    }
  }

  /**
   * @internal
   */
  finalize(): RenderResult<Cursor, Atom> {
    let range = finalizeRange(this.#range, this.#destroyers);
    let updater = updaters(this.#updaters, getOwner(this));

    return result(updater, range);
  }

  /**
   * A dynamic block is rendered once every time the inputs into the block
   * change. It returns a {@link RenderResult} that can be used to update
   * the block or replace the block with another block.
   *
   * @internal
   */
  renderDynamic(block: Block<Cursor, Atom>): RenderResult<Cursor, Atom> {
    let region = this.new(Region, this.#range.child());
    invokeBlock(block, region);

    return region.finalize();
  }

  /**
   * @internal
   */
  renderBlock(block: Block<Cursor, Atom>): void {
    let child = this.new(Region, this.#range, this.#updaters);

    invokeBlock(block, child);
  }
}

function result<Cursor, Atom>(
  update: Updater,
  range: ReactiveRange<Cursor, Atom>
): RenderResult<Cursor, Atom> {
  return {
    [DEBUG]: () => {
      return description("RenderResult");
    },

    rerender: () => {
      poll(update);
    },

    replace: (newBlock: Block<Cursor, Atom>) => {
      let region = update.new(Region, clearRange(range));
      newBlock(region);
      return region.finalize();
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
