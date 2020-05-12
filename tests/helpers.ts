import * as qunit from "qunit";

export function module(
  name: string
): <T extends { new (): object }>(target: T) => T {
  qunit.module(name);

  return (c) => c;
}

export function test(target: object, name: string): void {
  qunit.test(name, (assert) => {
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
  qunit.todo(name, (assert) => {
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
