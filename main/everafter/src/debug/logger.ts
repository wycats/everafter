import { unreachable } from "../utils";

export interface LogFilter {
  info: boolean;
  internals: boolean;
  warnings: boolean;
}

export const ALL_LOGS = {
  info: true,
  internals: true,
  warnings: true,
};

export const INFO_LOGS = {
  info: true,
  internals: false,
  warnings: true,
};

export const WARNING_LOGS = {
  info: false,
  internals: false,
  warnings: true,
};

export const enum LogLevel {
  Info = "Info",
  Internals = "Internals",
}

export interface Logger {
  begin(messageLevel: LogLevel, filter: LogFilter, string: string): void;
  result(
    level: LogLevel,
    filter: LogFilter,
    string: string,
    ...style: string[]
  ): void;
  end(level: LogLevel, filter: LogFilter, string: string): void;
  log(
    messageLevel: LogLevel,
    filter: LogFilter,
    string: string,
    ...style: string[]
  ): void;
  indent<T>(messageLevel: LogLevel, filter: LogFilter, callback: () => T): T;
}

export function shouldShow(filter: LogFilter, level: LogLevel): boolean {
  switch (level) {
    case LogLevel.Info:
      return filter.info;
    case LogLevel.Internals:
      return filter.internals;
  }
}

export class ConsoleLogger implements Logger {
  #showStackTrace: boolean;
  #indent = 0;

  constructor(showStackTrace: boolean) {
    this.#showStackTrace = showStackTrace;
  }

  indent<T>(level: LogLevel, filter: LogFilter, callback: () => T): T {
    if (shouldShow(filter, level)) {
      this.#indent++;
    }

    try {
      return callback();
    } finally {
      if (shouldShow(filter, level)) {
        this.#indent--;
      }
    }
  }

  increaseIndent(): void {
    this.#indent++;
  }

  decreaseIndent(): void {
    this.#indent--;
  }

  private logMethod(level: LogLevel): "debug" | "info" {
    switch (level) {
      case LogLevel.Info:
        return "info";
      case LogLevel.Internals:
        return "debug";
      default:
        unreachable(level);
    }
  }

  private logWithStackTrace(
    method: "debug" | "info",
    message: string,
    ...args: string[]
  ): void {
    let indented = `${"  ".repeat(this.#indent)}${message}`;

    if (this.#showStackTrace) {
      console.groupCollapsed(indented, ...args);
      console.trace();
      console.groupEnd();
    } else {
      console[method](indented, ...args);
    }
  }

  log(
    level: LogLevel,
    filter: LogFilter,
    message: string,
    ...style: string[]
  ): void {
    if (!shouldShow(filter, level)) {
      return;
    }

    let args: [string, ...string[]] = style.length
      ? [`${"  ".repeat(this.#indent)}%c${message}`, ...style]
      : [`${"  ".repeat(this.#indent)}${message}`];

    this.logWithStackTrace(this.logMethod(level), ...args);
  }

  begin(level: LogLevel, filter: LogFilter, string: string): void {
    if (!shouldShow(filter, level)) {
      return;
    }

    this.logWithStackTrace(this.logMethod(level), `-> ${string}`);
  }

  result(
    level: LogLevel,
    filter: LogFilter,
    string: string,
    ...style: string[]
  ): void {
    if (!shouldShow(filter, level)) {
      return;
    }

    let message = style.length ? `[RESULT] %c${string}` : `[RESULT] ${string}`;

    this.logWithStackTrace(this.logMethod(level), message, ...style);
  }

  end(level: LogLevel, filter: LogFilter, string: string): void {
    if (!shouldShow(filter, level)) {
      return;
    }
    let message = `<- %c${string}`;

    this.logWithStackTrace("debug", message, "color: #999");
  }
}
