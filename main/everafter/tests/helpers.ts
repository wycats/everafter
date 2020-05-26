import * as qunit from "qunit";
import {
  defaultHost,
  Host,
  LogFilter,
  ALL_LOGS,
  INFO_LOGS,
  WARNING_LOGS,
  Owner,
} from "../src";

export function module(
  name: string
): <T extends { new (): object }>(target: T) => T {
  qunit.module(name);

  return c => c;
}

export function test(target: object, name: string): void {
  qunit.test(name, assert => {
    let constructor = target.constructor as {
      new (): {
        assert: qunit.Assert;
      };
    };
    let instance = new constructor();
    instance.assert = assert;
    return (instance as { assert: qunit.Assert } & Dict<Function>)[name](
      assert
    );
  });
}

export function todo(target: object, name: string): void {
  qunit.todo(name, assert => {
    let constructor = target.constructor as {
      new (): {
        assert: qunit.Assert;
      };
    };
    let instance = new constructor();
    instance.assert = assert;
    return (instance as { assert: qunit.Assert } & Dict<Function>)[name](
      assert
    );
  });
}

interface Dict<T = unknown> {
  [key: string]: T;
}

export function owner(messages: string[] = []): Owner {
  let host = defaultHost({
    showStackTraces: qunit.config.stacktraces,
    filter: filter(),
    messages,
  });

  return new Owner(host);
}

function filter(): LogFilter {
  switch (qunit.config.logging) {
    case "all":
      return ALL_LOGS;
    case "info":
      return INFO_LOGS;
    case "warning":
      return WARNING_LOGS;
    default:
      return INFO_LOGS;
  }
}
