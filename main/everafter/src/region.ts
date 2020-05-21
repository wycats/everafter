import {
  annotate,
  caller,
  LogLevel,
  printStructured,
  PARENT,
  Source,
} from "./debug/index";
import type {
  Block,
  Host,
  ReactiveRange,
  AppendingReactiveRange,
  BlockFunction,
} from "./interfaces";
import { Updater, Updaters } from "./update";
import { invokeBlock } from "./block-primitives";
import type { CursorAdapter } from "./builder";
import { effect } from "./effect";

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
    region.renderStatic(block);
    return region.#updaters;
  }

  #range: AppendingReactiveRange<Cursor, Atom>;
  #updaters: Updaters;
  #host: Host;

  constructor(
    range: AppendingReactiveRange<Cursor, Atom>,
    host: Host,
    updaters: Updaters = new Updaters()
  ) {
    if (range instanceof Region) {
      throw new Error(`assert: can't wrap TrackedOutput around TrackedOutput`);
    }

    this.#range = range;
    this.#host = host;
    this.#updaters = updaters;
  }

  atom(reactiveAtom: Atom, source = caller(PARENT)): void {
    this.updateWith(
      effect(() => this.#range.append(reactiveAtom), source, this.#host)
    );
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
    let appender = adapter.flush(this.#range, child.#range.finalize());

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
      this.#updaters.add(update);
    }
  }

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
    into?: ReactiveRange<Cursor, Atom>
  ): ReactiveRange<Cursor, Atom> {
    let cursor = into ? into.clear() : this.#range.child();

    let region = new Region(cursor, this.#host);

    block(region, this.#host);

    return region.#range.finalize();
  }

  /**
   * A static block is only rendered one time, which means that any static
   * parts of the output will never change. Dynamic atoms or blocks *inside*
   * the block may still change, but the block itself will not.
   *
   * @internal
   */
  renderStatic(block: BlockFunction<Cursor, Atom>): void {
    let region = new Region(this.#range, this.#host);

    block(region, this.#host);

    this.updateWith(region.#updaters);
  }

  /**
   * @internal
   */
  renderBlock(block: Block<Cursor, Atom>): void {
    let child = new Region(this.#range, this.#host, this.#updaters);

    invokeBlock(block, child, this.#host);
  }
}
