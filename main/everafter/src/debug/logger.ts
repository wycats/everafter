import { unreachable } from "../utils";

export interface LogFilter {
  info: boolean;
  internals: boolean;
  warnings: boolean;
  testing: boolean;
}

export const ALL_LOGS = {
  info: true,
  internals: true,
  warnings: true,
  testing: true,
};

export const INFO_LOGS = {
  info: true,
  internals: false,
  warnings: true,
  testing: true,
};

export const WARNING_LOGS = {
  info: false,
  internals: false,
  warnings: true,
  testing: true,
};

export const enum LogLevel {
  Info = "Info",
  Internals = "Internals",
  Testing = "Testing",
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
    case LogLevel.Testing:
      return filter.testing;
  }
}

export class ConsoleLogger implements Logger {
  #showStackTrace: boolean;
  #indent = 0;
  #testMessages: string[];

  constructor(showStackTrace: boolean, messages: string[]) {
    this.#showStackTrace = showStackTrace;
    this.#testMessages = messages;
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

  private logMethod(level: LogLevel): (arg: string, ...args: string[]) => void {
    switch (level) {
      case LogLevel.Testing:
        return (arg: string, ...args: string[]) =>
          this.#testMessages.push(arg, ...args);
      case LogLevel.Info:
        return (arg: string, ...args: string[]) => {
          this.logWithStackTrace(console.info, arg, ...args);
        };
      case LogLevel.Internals:
        return (arg: string, ...args: string[]) => {
          this.logWithStackTrace(console.debug, arg, ...args);
        };
      default:
        unreachable(level);
    }
  }

  private logWithStackTrace(
    method: (...args: string[]) => void,
    message: string,
    ...args: string[]
  ): void {
    let indented = `${"  ".repeat(this.#indent)}${message}`;

    if (this.#showStackTrace) {
      console.groupCollapsed(indented, ...args);
      console.trace();
      console.groupEnd();
    } else {
      method(indented, ...args);
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

    this.logMethod(level)(message, ...style);
  }

  begin(level: LogLevel, filter: LogFilter, string: string): void {
    if (!shouldShow(filter, level)) {
      return;
    }

    this.logMethod(level)(`-> ${string}`);
  }

  status(
    level: LogLevel,
    filter: LogFilter,
    string: string,
    ...style: string[]
  ): void {
    if (!shouldShow(filter, level)) {
      return;
    }

    let message = style.length ? `! %c${string}` : `! ${string}`;

    this.logMethod(level)(message, ...style);
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

    let message = style.length ? `= %c${string}` : `= ${string}`;

    this.logMethod(level)(message, ...style);
  }

  end(level: LogLevel, filter: LogFilter, string: string): void {
    if (!shouldShow(filter, level)) {
      return;
    }
    let message = `<- %c${string}`;

    this.logWithStackTrace(console.debug, message, "color: #999");
  }
}
