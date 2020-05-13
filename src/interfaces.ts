import type { Operations, CursorRange } from "./ops";
import type { Updater } from "./update";
import type { Output } from "./output";
import {
  Debuggable,
  Logger,
  ConsoleLogger,
  LogLevel,
  printStructured,
  Structured,
} from "./debug";

export type OutputFactory<Ops extends Operations> = (
  cursor: Ops["cursor"]
) => AbstractOutput<Ops>;

export abstract class AbstractOutput<Ops extends Operations> {
  abstract range<T>(callback: () => T): { value: T; range: CursorRange<Ops> };
  abstract getOutput(): OutputFactory<Ops>;
  abstract getCursor(): Ops["cursor"];

  abstract appendLeaf(leaf: Ops["leafKind"]): Updater;
  abstract openBlock<B extends Ops["blockKind"]>(
    open: B["open"]
  ): BlockBuffer<Ops, B>;
}

export interface UserBlock<Ops extends Operations> {
  desc: Structured;
  invoke(output: Output<Ops>, inner: AbstractOutput<Ops>): Updater | void;
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
  [RENDER](output: AbstractOutput<Ops>, host: Host): Updater | void;
}

export type LogStep = Generator<Promise<unknown>, void, unknown>;

export function logUpdaters(updaters: Updater[], host: Host): void {
  if (updaters.length) {
    host.logResult(
      LogLevel.Info,
      "UPDATERS",
      "color: green; font-weight: bold"
    );
    for (let updater of updaters) {
      host.logResult(LogLevel.Info, `- ${printStructured(updater, true)}`);
    }
  } else {
    host.logResult(LogLevel.Info, "No updaters");
  }
}

export interface Host {
  logger: Logger;
  level: LogLevel;
  log(level: LogLevel, message: string, ...style: string[]): void;
  begin(level: LogLevel, string: string): void;
  logResult(level: LogLevel, string: string, ...style: string[]): void;
  end(level: LogLevel, string: string): void;
  indent<T>(level: LogLevel, callback: () => T): T;
}

export function defaultHost({
  showStackTraces = false,
  logLevel: hostLevel = LogLevel.Info,
}: { showStackTraces?: boolean; logLevel?: LogLevel } = {}): Host {
  let logger = new ConsoleLogger(showStackTraces);

  return {
    logger,
    level: hostLevel,
    log(messageLevel: LogLevel, message: string, ...style: string[]): void {
      logger.log(messageLevel, hostLevel, message, ...style);
    },
    begin(level: LogLevel, message: string): void {
      logger.begin(level, hostLevel, message);
    },
    logResult(level: LogLevel, message: string, ...style: string[]): void {
      logger.result(level, hostLevel, message, ...style);
    },
    end(level: LogLevel, message: string): void {
      logger.end(level, hostLevel, message);
    },
    indent<T>(level: LogLevel, callback: () => T): T {
      return logger.indent(level, hostLevel, callback);
    },
  };
}
