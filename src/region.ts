import {
  annotate,
  caller,
  LogLevel,
  printStructured,
  PARENT,
} from "./debug/index";
import type {
  Block,
  Host,
  ReactiveRange,
  RegionAppender,
  UserBlock,
} from "./interfaces";
import { initialize, toUpdater, Updater } from "./update";
import { invokeBlock } from "./block-primitives";
import type { CursorAdapter } from "./builder";

/**
 * A {@link Region} is created for each area of the output. The {@link Region}
 * inserts the content into a cursor, and produces a set of updaters that will
 * be run whenever inputs to the region have changed.
 */
export class Region<Cursor, Atom> {
  static render<Cursor, Atom>(
    block: UserBlock<Cursor, Atom>,
    appender: RegionAppender<Cursor, Atom>,
    host: Host
  ): Updater | void {
    let region = new Region(appender, host);
    region.renderStatic(block);
    return toUpdater(region.#updaters);
  }

  #appender: RegionAppender<Cursor, Atom>;
  #updaters: Updater[];
  #host: Host;

  constructor(
    appender: RegionAppender<Cursor, Atom>,
    host: Host,
    updaters: Updater[] = []
  ) {
    if (appender instanceof Region) {
      throw new Error(`assert: can't wrap TrackedOutput around TrackedOutput`);
    }

    this.#appender = appender;
    this.#host = host;
    this.#updaters = updaters;
  }

  atom(atom: Atom, source = caller(PARENT)): void {
    this.updateWith(
      initialize(
        annotate(() => this.#appender.atom(atom), source),
        this.#host
      )
    );
  }

  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<Cursor, Atom, ChildCursor, ChildAtom>
  ): Region<ChildCursor, ChildAtom> {
    let appender = adapter.child(this.#appender.getCursor());
    return new Region(appender, this.#host, this.#updaters);
  }

  flush<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<Cursor, Atom, ChildCursor, ChildAtom>,
    child: Region<ChildCursor, ChildAtom>
  ): Region<Cursor, Atom> {
    let appender = adapter.flush(
      this.#appender.getCursor(),
      child.#appender.getCursor()
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
      this.#updaters.push(update);
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
    block: UserBlock<Cursor, Atom>,
    into?: ReactiveRange<Cursor>
  ): ReactiveRange<Cursor> {
    let cursor = into ? into.clear() : this.#appender.getCursor();

    let appender = this.#appender.getChild()(cursor);
    let region = new Region(appender, this.#host);

    block.f(region, this.#host);

    return region.#appender.finalize();
  }

  /**
   * A static block is only rendered one time, which means that any static
   * parts of the output will never change. Dynamic atoms or blocks *inside*
   * the block may still change, but the block itself will not.
   *
   * @internal
   */
  renderStatic(block: UserBlock<Cursor, Atom>): void {
    let region = new Region(this.#appender, this.#host);

    block.f(region, this.#host);

    this.updateWith(toUpdater(region.#updaters));
  }

  /**
   * @internal
   */
  renderBlock(block: Block<Cursor, Atom>): void {
    let output = this.#appender.getChild()(this.#appender.getCursor());
    let child = new Region(output, this.#host, this.#updaters);

    invokeBlock(block, child, this.#host);
  }
}
