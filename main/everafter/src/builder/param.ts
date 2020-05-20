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

export type ReactiveDict<
  R extends ReactiveParameters
> = R extends ReactiveParameters<infer R> ? R : never;

export function constant<T>(value: T): ReactiveParameter<T> {
  return reactive(() => Const(value), "const");
}

export function call<A extends Var[], B>(
  call: AnnotatedFunction<UserCall<A, B>>,
  ...inputs: ReactiveParametersForValues<A>
): ReactiveParameter<B> {
  return reactive(state => {
    let hydratedInputs = inputs.map(input => input.hydrate(state)) as A;
    return Derived(() => call(...hydratedInputs));
  }, "call");
}

export class ReactiveParameters<
  D extends Dict<ReactiveParameter> = Dict<ReactiveParameter>
> {
  static for<D extends Dict<ReactiveParameter>>(
    input: ReactiveInputs<D>
  ): ReactiveParameters<D> {
    let dict: Dict = {};
    for (let [key, value] of Object.entries(input)) {
      dict[key] = value(key);
    }

    return new ReactiveParameters(dict as D);
  }

  #params: D;

  constructor(params: D) {
    this.#params = params;
  }

  get dict(): D {
    return this.#params;
  }

  get<K extends keyof D>(key: K): D[K] {
    if (key in this.#params) {
      return this.#params[key] as D[K];
    } else {
      let param = reactive(
        state => state.dynamic[key as string],
        "dynamic"
      ) as D[K];

      this.#params[key] = param;
      return param;
    }
  }

  hydrate(dict: DynamicRuntimeValues<D>): ReactiveState {
    return new ReactiveState(dict);
  }
}

export function Param<T>(): (key: string) => ReactiveParameter<T> {
  return key =>
    reactive(
      state => state.dynamic[key as string],
      "dynamic"
    ) as ReactiveParameter<T>;
}

export interface ReactiveParameter<T = unknown> extends Debuggable {
  hydrate(state: ReactiveState): Var<T>;
}

let ID = 0;

function reactive<T>(
  callback: (state: ReactiveState) => Var<T>,
  kind: string
): ReactiveParameter<T> {
  return {
    [DEBUG](): Structured {
      return newtype("reactive", description(`${kind}(${ID++})`));
    },
    hydrate(state: ReactiveState): Var<T> {
      return callback(state);
    },
  };
}

export type ReactiveInput<T extends ReactiveParameter> = (key: string) => T;
export type ReactiveInputs<T extends Dict<ReactiveParameter>> = {
  [P in keyof T]: ReactiveInput<T[P]>;
};

export type ReactiveParametersForInputs<
  I extends ReactiveInputs<Dict<ReactiveParameter>>
> = I extends ReactiveInputs<infer R> ? ReactiveParameters<R> : never;

type UserCall<A extends Var[], B> = (...args: A) => B;

type ReactiveParameterForValue<V extends Var> = V extends Var<infer R>
  ? ReactiveParameter<R>
  : never;

type ReactiveParametersForValues<A extends Var[]> = {
  [P in keyof A]: A[P] extends Var ? ReactiveParameterForValue<A[P]> : never;
};

export type RuntimeValuesForDict<D extends Dict<ReactiveParameter>> = {
  [P in keyof D]: D[P] extends ReactiveParameter<infer R> ? Var<R> : never;
};

export type DynamicRuntimeValues<
  D extends Dict<ReactiveParameter> | ReactiveParameters
> = D extends ReactiveParameters<infer D>
  ? RuntimeValuesForDict<D>
  : D extends Dict<ReactiveParameter>
  ? RuntimeValuesForDict<D>
  : never;
