import type { Updater } from "./update";
import type { Output } from "./output";
import {
  Debuggable,
  Logger,
  ConsoleLogger,
  LogLevel,
  INFO_LOGS,
  LogFilter,
  AnnotatedFunction,
} from "./debug/index";

export interface BlockDetails {
  open: unknown;
  head: unknown;
}

/**
 * `Operations` ties together the type parameters that a reactive output uses
 * throughout its implementation.
 */
export interface Operations {
  /**
   * A cursor is a position in the reactive output where new atoms are inserted.
   *
   * For example, a DOM cursor is a `parentNode` and `nextSibling`. An array
   * cursor is an offset into the array.
   */
  cursor: unknown;

  /**
   * A given reactive output can support more than one kind of atom. A leaf
   * has one or more reactive inputs, and additional information about how to
   * insert it into the cursor.
   *
   * For example, for a DOM output, a text leaf would contain a reactive string
   * and know how to insert it, as a text node, at the cursor.
   *
   * For an array output, a number leaf would contain a reactive number and know
   * how to insert it directly into the array.
   */
  atom: unknown;

  /**
   * A given reactive output can support more than one kind of block that appears
   * in the output. After a block is opened, a number of its "head" items can be
   * inserted into the output, and the head is then flushed. After the head is
   * flushed, a number of normal body elements are inserted, and the block is
   * finally closed.
   *
   * For example, for a DOM output, an element block would be opened with a
   * reactive string as its tag name, get a number of attributes as "head"
   * items, and get closed when the element is closed.
   *
   * For a file system output, a file block would be opened with a file name
   * as its tag name, get a number of file attributes as "head" items, and get
   * closed when the file is done.
   */
  block: BlockDetails;
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
export interface ReactiveRange<Ops extends Operations> extends Debuggable {
  /**
   * When a reactive range is cleared, all of its contents are removed from
   * the output, and a new cursor is created for new content.
   */
  clear(): Ops["cursor"];
}

/**
 * An {@link OutputFactory} for a given set of reactive operations takes a cursor
 * and gives back a reactive output.
 */
export type OutputFactory<Ops extends Operations> = (
  cursor: Ops["cursor"]
) => RegionAppender<Ops>;

/**
 * A {@link RegionAppender} is the core engine that reflects fresh input values
 * into the output.
 *
 * Reactive Prototype creates an instance of {@link RegionAppender} for each
 * area of the output that might need to be re-created from scratch.
 *
 * For example, consider {@link Builder::ifBlock}. When the output is first
 * created, one of the two branches of the conditional will execute, and the
 * operations will insert content into the output. But if the condition
 * changes, the region of the output that was created the first time will be
 * cleared (producing a cursor), and the other branch of the conditional will
 * execute, inserting new content at the cursor.
 */
export interface RegionAppender<Ops extends Operations> {
  /**
   * The {@link getChild} method returns a function that takes a cursor and
   * produces a new instance of a reactive output, parameterized over the
   * operations.
   *
   * It's called {@link getChild} because of an invariant: the returned
   * function will be called with a cursor that is logically inside of the
   * current reactive output.
   */
  getChild(): OutputFactory<Ops>;

  /**
   * The {@link finalize} method is called once all operations for the current
   * output region have finished. The {@link ReactiveRange} that is returned
   * will be cleared if necessary.
   */
  finalize(): ReactiveRange<Ops>;

  /**
   * Provide a cursor that corresponds to the current location in the output.
   *
   * A cursor is transient. Reactive Prototype will not hold onto it, so
   * a {@link RegionAppender} doesn't need to do any bookkeeping related to it.
   */
  getCursor(): Ops["cursor"];

  /**
   * Insert an atom at the current cursor, returning a possible `Updater`.
   */
  atom(leaf: Ops["atom"]): Updater | void;

  /**
   * Open a block at the current cursor, returning an appropriate block
   * buffer for the kind of block being created.
   */
  open<B extends Ops["block"]>(open: B["open"]): BlockBuffer<Ops, B>;
}

export type UserBlockFunction<Ops extends Operations> = (
  output: Output<Ops>,
  runtime: RegionAppender<Ops>,
  host: Host
) => void;

export type UserBlock<Ops extends Operations> = AnnotatedFunction<
  UserBlockFunction<Ops>
>;

export interface BlockBuffer<
  Ops extends Operations,
  Kind extends Ops["block"]
> {
  head(head: Kind["head"]): void;
  flush(): void;
  close(): void;
}

export const RENDER = Symbol("RENDER");

/**
 * A `Block` represents a collection of operations that correspond to an
 * exclusive part of the output.
 *
 * When a `Block` is first rendered, it produces an `Updater` that can be
 * polled to attempt to update it.
 */
export interface Block<Ops extends Operations> extends Debuggable {
  [RENDER](output: Output<Ops>, host: Host): void;
}

export type LogStep = Generator<Promise<unknown>, void, unknown>;

export interface Host {
  logger: Logger;
  filter: LogFilter;
  log(level: LogLevel, message: string, ...style: string[]): void;
  begin(level: LogLevel, string: string): void;
  logResult(level: LogLevel, string: string, ...style: string[]): void;
  end(level: LogLevel, string: string): void;
  indent<T>(level: LogLevel, callback: () => T): T;
}

export function defaultHost({
  showStackTraces = false,
  filter = INFO_LOGS,
}: { showStackTraces?: boolean; filter?: LogFilter } = {}): Host {
  let logger = new ConsoleLogger(showStackTraces);

  return {
    logger,
    filter,
    log(messageLevel: LogLevel, message: string, ...style: string[]): void {
      logger.log(messageLevel, filter, message, ...style);
    },
    begin(level: LogLevel, message: string): void {
      logger.begin(level, filter, message);
    },
    logResult(level: LogLevel, message: string, ...style: string[]): void {
      logger.result(level, filter, message, ...style);
    },
    end(level: LogLevel, message: string): void {
      logger.end(level, filter, message);
    },
    indent<T>(level: LogLevel, callback: () => T): T {
      return logger.indent(level, filter, callback);
    },
  };
}
