import type { Operations, CursorRange } from "./ops";
import type { Updater } from "./update";
import type { Output } from "./output";
import {
  Debuggable,
  Logger,
  ConsoleLogger,
  LogLevel,
  Structured,
  INFO_LOGS,
  LogFilter,
} from "./debug";

export type OutputFactory<Ops extends Operations> = (
  cursor: Ops["cursor"]
) => AbstractOutput<Ops>;

export abstract class AbstractOutput<Ops extends Operations> {
  abstract range<T>(callback: () => T): { value: T; range: CursorRange<Ops> };
  abstract getOutput(): OutputFactory<Ops>;
  abstract getCursor(): Ops["cursor"];

  abstract appendLeaf(leaf: Ops["leafKind"]): Updater | void;
  abstract openBlock<B extends Ops["blockKind"]>(
    open: B["open"]
  ): BlockBuffer<Ops, B>;
}

export type UserBlockFunction<Ops extends Operations> = (
  output: Output<Ops>,
  runtime: AbstractOutput<Ops>,
  host: Host
) => void;

export interface UserBlock<Ops extends Operations> {
  desc: Structured;
  invoke: UserBlockFunction<Ops>;
}

export interface BlockBuffer<
  Ops extends Operations,
  Kind extends Ops["blockKind"]
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
