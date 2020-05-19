import type { Updater } from "./update";
import type { Region } from "./region";
import {
  Debuggable,
  Logger,
  ConsoleLogger,
  LogLevel,
  INFO_LOGS,
  LogFilter,
  AnnotatedFunction,
  printStructured,
  IntoStructured,
  intoStructured,
  Structured,
  DebugFields,
  DEBUG,
  description,
} from "./debug/index";

export interface Operations<
  Cursor = unknown,
  Atom = unknown,
  DefaultAtom = Atom
> {
  appender(cursor: Cursor): RegionAppender<Cursor, Atom>;
  defaultAtom(atom: DefaultAtom): Atom;
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
export interface ReactiveRange<Cursor> extends Debuggable {
  /**
   * When a reactive range is cleared, all of its contents are removed from
   * the output, and a new cursor is created for new content.
   */
  clear(): Cursor;
}

/**
 * A special case of `ReactiveRange` that can't be cleared.
 *
 * TODO: This is fishy and should be revisited once everything else is in place
 */
export class StaticReactiveRange<Cursor> implements ReactiveRange<Cursor> {
  #cursor: Cursor;

  constructor(cursor: Cursor) {
    this.#cursor = cursor;
  }

  clear(): Cursor {
    return this.#cursor;
  }
  get debugFields(): DebugFields {
    return new DebugFields("StaticRange", { cursor: this.#cursor });
  }

  [DEBUG](): Structured {
    return description("StaticRange");
  }
}

/**
 * An {@link OutputFactory} for a given set of reactive operations takes a cursor
 * and gives back a reactive output.
 */
export type AppenderForCursor<Cursor, Atom> = (
  cursor: Cursor
) => RegionAppender<Cursor, Atom>;

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
export interface RegionAppender<Cursor, Atom> {
  /**
   * The {@link getChild} method returns a function that takes a cursor and
   * produces a new instance of a reactive output, parameterized over the
   * operations.
   *
   * It's called {@link getChild} because of an invariant: the returned
   * function will be called with a cursor that is logically inside of the
   * current reactive output.
   */
  getChild(): AppenderForCursor<Cursor, Atom>;

  /**
   * The {@link finalize} method is called once all operations for the current
   * output region have finished. The {@link ReactiveRange} that is returned
   * will be cleared if necessary.
   */
  finalize(): ReactiveRange<Cursor>;

  /**
   * Provide a cursor that corresponds to the current location in the output.
   *
   * A cursor is transient. Reactive Prototype will not hold onto it, so
   * a {@link RegionAppender} doesn't need to do any bookkeeping related to it.
   */
  getCursor(): Cursor;

  /**
   * Insert an atom at the current cursor, returning a possible `Updater`.
   */
  atom(atom: Atom): Updater | void;

  /**
   * Open a block at the current cursor, returning an appropriate block
   * buffer for the kind of block being created.
   */
  // open<O extends Ops["block"]>(open: O): Region<O>;
}

export type UserBlockFunction<Cursor, Atom> = (
  output: Region<Cursor, Atom>,
  host: Host
) => void;

export type UserBlock<Cursor, Atom> = AnnotatedFunction<
  UserBlockFunction<Cursor, Atom>
>;

export const RENDER = Symbol("RENDER");

/**
 * A `Block` represents a collection of operations that correspond to an
 * exclusive part of the output.
 *
 * When a `Block` is first rendered, it produces an `Updater` that can be
 * polled to attempt to update it.
 */
export interface Block<Cursor, Atom> extends Debuggable {
  [RENDER](output: Region<Cursor, Atom>, host: Host): void;
}

export interface Host {
  logger: Logger;
  filter: LogFilter;
  log(level: LogLevel, message: string, ...style: string[]): void;
  logResult(level: LogLevel, string: string, ...style: string[]): void;
  context<T>(level: LogLevel, structured: IntoStructured, callback: () => T): T;
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
    logResult(level: LogLevel, message: string, ...style: string[]): void {
      logger.result(level, filter, message, ...style);
    },
    indent<T>(level: LogLevel, callback: () => T): T {
      return logger.indent(level, filter, callback);
    },
    context<T>(level: LogLevel, into: IntoStructured, callback: () => T): T {
      let structured = intoStructured(into);

      logger.begin(level, filter, printStructured(structured, true));
      let result = this.indent(LogLevel.Info, () => callback());
      logger.end(LogLevel.Info, filter, printStructured(structured, false));
      return result;
    },
  };
}
