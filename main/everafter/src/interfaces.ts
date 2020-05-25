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
  Source,
} from "./debug/index";
import type { CompilableAtom } from "./builder";
import { destroy } from "./polyfill";

export interface CompileOperations<Cursor, Atom, DefaultAtom> {
  defaultAtom(atom: DefaultAtom, source: Source): CompilableAtom<Cursor, Atom>;
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
export interface ReactiveRange<Cursor, ReactiveAtom> extends Debuggable {
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
  extends Debuggable {
  append(atom: ReactiveAtom, source: Source): Updater;
  getCursor(): Cursor;
  child(): AppendingReactiveRange<Cursor, ReactiveAtom>;
  finalize(): ReactiveRange<Cursor, ReactiveAtom>;
}

export type BlockFunction<Cursor, Atom> = (
  output: Region<Cursor, Atom>
) => void;

export type Block<Cursor, Atom> = AnnotatedFunction<
  BlockFunction<Cursor, Atom>
>;

export const RENDER = Symbol("RENDER");

export interface Host {
  logger: Logger;
  filter: LogFilter;
  log(level: LogLevel, message: string, ...style: string[]): void;
  logResult(level: LogLevel, string: string, ...style: string[]): void;
  logStatus(level: LogLevel, string: string, ...style: string[]): void;
  context<T>(level: LogLevel, structured: IntoStructured, callback: () => T): T;
  indent<T>(level: LogLevel, callback: () => T): T;
}

export function defaultHost({
  showStackTraces = false,
  filter = INFO_LOGS,
  messages = [],
}: {
  showStackTraces?: boolean;
  filter?: LogFilter;
  messages?: string[];
} = {}): Host {
  let logger = new ConsoleLogger(showStackTraces, messages);

  return {
    logger,
    filter,
    log(messageLevel: LogLevel, message: string, ...style: string[]): void {
      logger.log(messageLevel, filter, message, ...style);
    },
    logResult(level: LogLevel, message: string, ...style: string[]): void {
      logger.result(level, filter, message, ...style);
    },
    logStatus(level: LogLevel, message: string, ...style: string[]): void {
      logger.status(level, filter, message, ...style);
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
