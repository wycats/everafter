import { Var, Const, Derived } from "../value";
// eslint-disable-next-line import/no-cycle
import { ReactiveState } from "./builder";
import type { Dict } from "../utils";
import {
  AnnotatedFunction,
  Debuggable,
  DEBUG,
  Structured,
  newtype,
  description,
} from "../debug";

export class ReactiveArguments<
  D extends Dict<ReactiveArgument> = Dict<ReactiveArgument>
> {
  #args: D;
  #constantValues: unknown[] = [];
  #constants: ReactiveArgument[] = [];

  constructor(args: D) {
    this.#args = args;
  }

  call<A extends Var[], B>(
    call: AnnotatedFunction<UserCall<A, B>>,
    ...inputs: ReactiveArgumentsForValues<A>
  ): ReactiveArgument<B> {
    return reactive(state => {
      let hydratedInputs = inputs.map(input => input.hydrate(state)) as A;
      return Derived(() => call.f(...hydratedInputs));
    }, "call");
  }

  const<T>(value: T): ReactiveArgument<T> {
    if (this.#constantValues.includes(value)) {
      return this.#constants[
        this.#constantValues.indexOf(value)
      ] as ReactiveArgument<T>;
    } else {
      let constant = reactive(() => Const(value), "const");
      this.#constantValues.push(value);
      this.#constants.push(constant);
      return constant;
    }
  }

  get<K extends keyof D>(key: K): D[K] {
    if (key in this.#args) {
      return this.#args[key] as D[K];
    } else {
      let arg = reactive(
        state => state.dynamic[key as string],
        "dynamic"
      ) as D[K];

      this.#args[key] = arg;
      return arg;
    }
  }

  hydrate(dict: DynamicRuntimeValues<D>): ReactiveState {
    return new ReactiveState(
      dict,
      this.#constantValues.map(v => Const(v))
    );
  }
}

export function Arg<T>(): (key: string) => ReactiveArgument<T> {
  return key =>
    reactive(
      state => state.dynamic[key as string],
      "dynamic"
    ) as ReactiveArgument<T>;
}

export interface ReactiveArgument<T = unknown> extends Debuggable {
  hydrate(state: ReactiveState): Var<T>;
}

let ID = 0;

function reactive<T>(
  callback: (state: ReactiveState) => Var<T>,
  kind: string
): ReactiveArgument<T> {
  return {
    [DEBUG](): Structured {
      return newtype("reactive", description(`${kind}(${ID++})`));
    },
    hydrate(state: ReactiveState): Var<T> {
      return callback(state);
    },
  };
}

type ReactiveInput<T extends ReactiveArgument> = (key: string) => T;
type ReactiveInputs<T extends Dict<ReactiveArgument>> = {
  [P in keyof T]: ReactiveInput<T[P]>;
};

export function args<D extends Dict<ReactiveArgument>>(
  input: ReactiveInputs<D>
): ReactiveArguments<D> {
  let dict: Dict = {};
  for (let [key, value] of Object.entries(input)) {
    dict[key] = value(key);
  }

  return new ReactiveArguments(dict as D);
}

type UserCall<A extends Var[], B> = (...args: A) => B;

type ReactiveArgumentForValue<V extends Var> = V extends Var<infer R>
  ? ReactiveArgument<R>
  : never;

type ReactiveArgumentsForValues<A extends Var[]> = {
  [P in keyof A]: A[P] extends Var ? ReactiveArgumentForValue<A[P]> : never;
};

type DynamicRuntimeValues<D extends Dict<ReactiveArgument>> = {
  [P in keyof D]: D[P] extends ReactiveArgument<infer R> ? Var<R> : never;
};
