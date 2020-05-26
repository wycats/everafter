import {
  Logger,
  LogFilter,
  LogLevel,
  IntoStructured,
  INFO_LOGS,
  ConsoleLogger,
  intoStructured,
  printStructured,
  AnnotatedFunction,
  Annotated,
  annotate,
  getSource,
} from "./debug";
import { unwrap } from "./utils";

export type Factory<T extends Owned | void, A extends unknown[] = []> = (
  owner: Owner,
  ...args: A
) => T;

export interface ClassFactory<
  T extends object | void,
  A extends unknown[] = []
> {
  new (owner: Owner, ...args: A): T;
}

export const OWNED = Symbol("OWNED");
export type OWNED = typeof OWNED;

export class Owned {
  constructor(owner: Owner) {
    OWNER.set(this, owner);
  }

  new<A extends unknown[], T extends Owned | void>(
    f: ClassFactory<T, A>,
    ...args: A
  ): T {
    let instance = new f(getOwner(this), ...args);
    return instance;
  }
}

export function ownedNew<A extends unknown[], T extends Owned | void>(
  this: Owned,
  f: ClassFactory<T, A>,
  ...args: A
): T {
  let instance = new f(getOwner(this), ...args);
  return instance;
}

const OWNER = new WeakMap<object, Owner>();

export class Owner {
  #host: Host;

  constructor(host: Host) {
    this.#host = host;
  }

  get host(): Host {
    return this.#host;
  }

  instantiate<A extends unknown[], T extends Owned | void>(
    f: Factory<T, A>,
    ...args: A
  ): T {
    let instance = f(this, ...args);
    return instance;
  }

  new<A extends unknown[], T extends Owned | void>(
    f: ClassFactory<T, A>,
    ...args: A
  ): T {
    let instance = new f(this, ...args);
    return instance;
  }
}

export function getOwner(o: Owned): Owner {
  let owner = OWNER.get(o);
  return unwrap(owner);
}

export function setOwner<T extends object>(value: T, o: Owner): T {
  OWNER.set(value, o);
  return value;
}

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
