import {
  annotate,
  caller,
  LogLevel,
  printStructured,
  PARENT,
  Source,
  getSource,
  DEBUG,
} from "./debug/index";
import {
  Block,
  Host,
  ReactiveRange,
  AppendingReactiveRange,
  BlockFunction,
  clearRange,
  RenderResult,
} from "./interfaces";
import { Updater, updaters, poll } from "./update";
import { invokeBlock } from "./block-primitives";
import type { CursorAdapter } from "./builder";
import { associateDestructor } from "@glimmer/util";
import { linkResource, associateDestroyableChild } from "./polyfill";

/**
 * A {@link Region} is created for each area of the output. The {@link Region}
 * inserts the content into a cursor, and produces a set of updaters that will
 * be run whenever inputs to the region have changed.
 */
export class Region<Cursor, Atom> {
  static render<Cursor, Atom>(
    block: Block<Cursor, Atom>,
    appender: AppendingReactiveRange<Cursor, Atom>,
    host: Host
  ): Updater | void {
    let region = new Region(appender, host);
    block(region);

    if (region.#updaters.length === 0) {
      return;
    } else {
      return updaters(region.#updaters, host, getSource(block));
    }
  }

  #range: AppendingReactiveRange<Cursor, Atom>;
  #updaters: Updater[];
  #destroyers: object = Object.freeze(Object.create(null));
  #host: Host;

  constructor(
    range: AppendingReactiveRange<Cursor, Atom>,
    host: Host,
    updaters: Updater[] = []
  ) {
    if (range instanceof Region) {
      throw new Error(`assert: can't wrap TrackedOutput around TrackedOutput`);
    }

    this.#range = range;
    this.#host = host;
    this.#updaters = updaters;
  }

  get host(): Host {
    return this.#host;
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
    return new Region(appender, this.#host, this.#updaters);
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

    return new Region(appender, this.#host, this.#updaters);
  }

  /**
   * Add an {@link Updater} to the list of updaters for the current region.
   *
   * When the output is updated, each of the updaters will be polled.
   *
   * @internal
   */
  updateWith(update: Updater | void): void {
    if (update) {
      this.#host.logResult(
        LogLevel.Info,
        `${printStructured(update, true)}`,
        "color: green"
      );
      linkResource(this.#destroyers, update);
      this.#updaters.push(update);
    }
  }

  child(): AppendingReactiveRange<Cursor, Atom> {
    return this.#range.child();
  }

  // /**
  //  * A dynamic block is rendered once every time the inputs into the block
  //  * change. Whenever the block is rendered again, the {@link ReactiveRange}
  //  * returned from {@link renderDynamic} is cleared, and the block is rendered
  //  * into the cursor produced by clearing the range.
  //  *
  //  * @internal
  //  */
  // renderDynamicInto(
  //   block: BlockFunction<Cursor, Atom>,
  //   cursor: AppendingReactiveRange<Cursor, Atom>,
  //   source: Source
  // ): RenderResult<Cursor, Atom> {}

  /**
   * A dynamic block is rendered once every time the inputs into the block
   * change. Whenever the block is rendered again, the {@link ReactiveRange}
   * returned from {@link renderDynamic} is cleared, and the block is rendered
   * into the cursor produced by clearing the range.
   *
   * @internal
   */
  renderDynamic(
    block: BlockFunction<Cursor, Atom>,
    source: Source,
    cursor = this.#range.child()
  ): RenderResult<Cursor, Atom> {
    let region = new Region(cursor, this.#host);

    block(region);

    let range = finalizeRange(region.#range, region.#destroyers);
    let update = updaters(region.#updaters, this.#host, source);

    return {
      [DEBUG]: () => {
        return source[DEBUG]();
      },

      rerender: () => {
        poll(update, this.#host);
      },

      replace: (newBlock: Block<Cursor, Atom>) => {
        return region.renderDynamic(newBlock, source, clearRange(range));
      },
    };
  }

  /**
   * @internal
   */
  renderBlock(block: Block<Cursor, Atom>): void {
    let child = new Region(this.#range, this.#host, this.#updaters);

    invokeBlock(block, child);
  }
}

function finalizeRange<Cursor, Atom>(
  appendingRange: AppendingReactiveRange<Cursor, Atom>,
  destroyers: object
): ReactiveRange<Cursor, Atom> {
  let range = appendingRange.finalize();
  associateDestroyableChild(range, destroyers);
  return range;
}
