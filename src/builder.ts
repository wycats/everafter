import type { StackTraceyFrame } from "stacktracey";
import { invokeBlock } from "./block-internals";
import { ConditionBlock, StaticBlock } from "./block-primitives";
import {
  annotatedBlock,
  AnnotatedFunction,
  annotateWithFrame,
  callerFrame,
  PARENT,
  DebugFields,
} from "./debug";
import type { AbstractOutput, Host } from "./interfaces";
import type { Operations } from "./ops";
import type { Output } from "./output";
import type { Dict } from "./utils";
import { Const, ReactiveValue, Derived } from "./value";

export type RuntimeState = Dict<ReactiveValue>;

export interface Compilable<Ops extends Operations> {
  compile(state: ReactiveState): Evaluate<Ops>;
}

export interface CompilableLeaf<
  Ops extends Operations,
  _L extends Ops["leafKind"]
> {
  compile(state: ReactiveState): Evaluate<Ops>;
}

export interface CompilableOpen<
  Ops extends Operations,
  B extends Ops["blockKind"] = Ops["blockKind"]
> {
  compile(state: ReactiveState): Evaluate<Ops, B["open"]>;
}

export interface CompilableHead<
  Ops extends Operations,
  _B extends Ops["blockKind"]
> {
  compile(state: ReactiveState): Evaluate<Ops>;
}

export type Evaluate<Ops extends Operations, Out = void> = AnnotatedFunction<
  (output: Output<Ops>, runtime: AbstractOutput<Ops>, host: Host) => Out
>;

type UserBuilderBlock<Ops extends Operations> = AnnotatedFunction<
  (builder: Builder<Ops>) => void
>;

type UserCall<A extends ReactiveValue[], B> = (...args: A) => B;

type ReactiveArgumentForValue<
  V extends ReactiveValue
> = V extends ReactiveValue<infer R> ? ReactiveArgument<R> : never;
type ReactiveArgumentsForValues<A extends ReactiveValue[]> = {
  [P in keyof A]: A[P] extends ReactiveValue
    ? ReactiveArgumentForValue<A[P]>
    : never;
};

interface Builder<Ops extends Operations> {
  leaf(leaf: CompilableLeaf<Ops, Ops["leafKind"]>): void;

  /**
   * increment the directness parameter if calling an inner `ifBlock`
   */
  ifBlock<A extends ReactiveArgument<boolean>>(
    condition: A,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    directness: number
  ): void;
  /**
   * increment the directness parameter if calling an inner `open`
   */
  open<B extends Ops["blockKind"]>(
    value: CompilableOpen<Ops, B>,
    directness: number
  ): BlockBuilder<Ops, B>;

  close<B extends Ops["blockKind"]>(block: Block<Ops, B>): void;
}

class BlockBuilder<Ops extends Operations, B extends Ops["blockKind"]> {
  #open: CompilableOpen<Ops, B>;
  #parent: Builder<Ops>;
  #head: CompilableHead<Ops, B>[] = [];
  #location: StackTraceyFrame;

  constructor(
    open: CompilableOpen<Ops, B>,
    parent: Builder<Ops>,
    location: StackTraceyFrame
  ) {
    this.#open = open;
    this.#parent = parent;
    this.#location = location;
  }

  head(head: CompilableHead<Ops, B>): void {
    this.#head.push(head);
  }

  flush(): BlockBodyBuilder<Ops, B> {
    return new BlockBodyBuilder(
      this.#open,
      this.#parent,
      this.#head,
      this.#location
    );
  }
}

class Block<Ops extends Operations, B extends Ops["blockKind"]>
  implements Compilable<Ops> {
  #open: CompilableOpen<Ops, B>;
  #head: readonly CompilableHead<Ops, B>[];
  #statements: readonly Statement<Ops>[];
  #location: StackTraceyFrame;

  constructor(
    open: CompilableOpen<Ops, B>,
    head: readonly CompilableHead<Ops, B>[],
    statements: readonly Statement<Ops>[],
    location: StackTraceyFrame
  ) {
    this.#open = open;
    this.#head = head;
    this.#statements = statements;
    this.#location = location;
  }

  compile(state: ReactiveState): Evaluate<Ops> {
    let open = this.#open.compile(state);
    let head = this.#head.map(h => h.compile(state));
    let body = this.#statements.map(s => s.compile(state));

    let func = (
      output: Output<Ops>,
      runtime: AbstractOutput<Ops>,
      host: Host
    ): void => {
      let buffer = output.open(open.f(output, runtime, host));

      for (let item of head) {
        buffer.head(item);
      }

      buffer.flush();

      for (let item of body) {
        item.f(output, runtime, host);
      }

      buffer.close();
    };

    return annotateWithFrame(func, this.#location);
  }
}

class Conditional<Ops extends Operations> implements Compilable<Ops> {
  #condition: ReactiveArgument<boolean>;
  #then: CompilableBlock<Ops>;
  #else: CompilableBlock<Ops>;
  #location: StackTraceyFrame;

  constructor(
    condition: ReactiveArgument<boolean>,
    then: CompilableBlock<Ops>,
    otherwise: CompilableBlock<Ops>,
    location: StackTraceyFrame
  ) {
    this.#condition = condition;
    this.#then = then;
    this.#else = otherwise;
    this.#location = location;
  }

  compile(state: ReactiveState): Evaluate<Ops> {
    let condition = this.#condition.hydrate(state);
    let then = this.#then.compile(state);
    let otherwise = this.#else.compile(state);

    let func = (
      output: Output<Ops>,
      _runtime: AbstractOutput<Ops>,
      host: Host
    ): void => {
      let cond = new ConditionBlock<Ops>(condition, then, otherwise);
      output.updateWith(invokeBlock(cond, output.getChild(), host));
    };

    return annotateWithFrame(func, this.#location);
  }
}

export type Statement<Ops extends Operations> = Compilable<Ops>;

export class StatementsBuilder<Ops extends Operations> implements Builder<Ops> {
  #statements: Statement<Ops>[] = [];

  done(): readonly Statement<Ops>[] {
    return this.#statements;
  }

  leaf(leaf: CompilableLeaf<Ops, Ops["leafKind"]>): void {
    this.#statements.push(leaf);
  }

  /**
   * @param condition a reactive boolean
   * @param then a user block
   * @param otherwise a user block
   */
  ifBlock(
    condition: ReactiveArgument<boolean>,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    directness: number
  ): void {
    let location = callerFrame(directness);
    let thenBlock = CompilableBlock.from(then);
    let otherwiseBlock = CompilableBlock.from(otherwise);

    this.#statements.push(
      new Conditional(condition, thenBlock, otherwiseBlock, location)
    );
  }

  open<B extends Ops["blockKind"]>(
    open: CompilableOpen<Ops, B>,
    directness: number
  ): BlockBuilder<Ops, B> {
    let location = callerFrame(directness);
    return new BlockBuilder(open, this, location);
  }

  close<B extends Ops["blockKind"]>(block: Block<Ops, B>): void {
    this.#statements.push(block);
  }
}

class CompilableBlock<Ops extends Operations> {
  static from<Ops extends Operations>(
    block: UserBuilderBlock<Ops>
  ): CompilableBlock<Ops> {
    let builder = new StaticBlockBuilder<Ops>();
    block.f(builder);
    return new CompilableBlock(builder.done(), block.source);
  }

  #statements: readonly Statement<Ops>[];
  #location: StackTraceyFrame;

  constructor(
    statements: readonly Statement<Ops>[],
    location: StackTraceyFrame
  ) {
    this.#statements = statements;
    this.#location = location;
  }

  compile(state: ReactiveState): StaticBlock<Ops> {
    let statements = this.#statements.map(s => s.compile(state));

    let func = annotatedBlock(
      (output: Output<Ops>, runtime: AbstractOutput<Ops>, host: Host): void => {
        for (let statement of statements) {
          statement.f(output, runtime, host);
        }
      },
      this.#location
    );

    return new StaticBlock(func);
  }
}

class StaticBlockBuilder<Ops extends Operations> implements Builder<Ops> {
  #statements: Statement<Ops>[] = [];

  done(): readonly Statement<Ops>[] {
    return this.#statements;
  }

  leaf(leaf: CompilableLeaf<Ops, Ops["leafKind"]>): void {
    this.#statements.push(leaf);
  }

  ifBlock(
    condition: ReactiveArgument<boolean>,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>
  ): void {
    let location = callerFrame(PARENT);

    let cond = new Conditional(
      condition,
      CompilableBlock.from(then),
      CompilableBlock.from(otherwise),
      location
    );

    this.#statements.push(cond);
  }

  open<B extends Ops["blockKind"]>(
    open: CompilableOpen<Ops, B>
  ): BlockBuilder<Ops, B> {
    return new BlockBuilder(open, this, callerFrame(PARENT));
  }

  close<B extends Ops["blockKind"]>(block: Block<Ops, B>): void {
    this.#statements.push(block);
  }
}

class BlockBodyBuilder<Ops extends Operations, B extends Ops["blockKind"]>
  implements Builder<Ops> {
  #open: CompilableOpen<Ops, B>;
  #parent: Builder<Ops>;
  #head: readonly CompilableHead<Ops, B>[];
  #location: StackTraceyFrame;
  #builder = new StatementsBuilder<Ops>();

  constructor(
    open: CompilableOpen<Ops, B>,
    parent: Builder<Ops>,
    head: readonly CompilableHead<Ops, B>[],
    location: StackTraceyFrame
  ) {
    this.#open = open;
    this.#parent = parent;
    this.#head = head;
    this.#location = location;
  }

  done(): Block<Ops, B> {
    return new Block(
      this.#open,
      this.#head,
      this.#builder.done(),
      this.#location
    );
  }

  close(): void {
    this.#parent.close(this.done());
  }

  leaf(leaf: CompilableLeaf<Ops, Ops["leafKind"]>): void {
    this.#builder.leaf(leaf);
  }

  ifBlock(
    condition: ReactiveArgument<boolean>,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    directness: number
  ): void {
    this.#builder.ifBlock(condition, then, otherwise, directness + 1);
  }

  open<B extends Ops["blockKind"]>(
    open: CompilableOpen<Ops, B>,
    directness: number
  ): BlockBuilder<Ops, B> {
    return this.#builder.open(open, directness + 1);
  }
}

export class ProgramBuilder<Ops extends Operations>
  implements Builder<Ops>, Compilable<Ops> {
  #statements = new StatementsBuilder<Ops>();
  #location: StackTraceyFrame;
  #args: ReactiveArguments;

  constructor(args: ReactiveArguments, location: StackTraceyFrame) {
    this.#args = args;
    this.#location = location;
  }

  compile(state: ReactiveState): Evaluate<Ops> {
    let statements = this.#statements.done().map(s => s.compile(state));

    let func = (
      output: Output<Ops>,
      runtime: AbstractOutput<Ops>,
      host: Host
    ): void => {
      for (let statement of statements) {
        statement.f(output, runtime, host);
      }
    };

    return annotateWithFrame(func, this.#location);
  }

  leaf(leaf: CompilableLeaf<Ops, Ops["leafKind"]>): void {
    this.#statements.leaf(leaf);
  }

  ifBlock<A extends ReactiveArgument<boolean>>(
    condition: A,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>
  ): void {
    this.#statements.ifBlock(condition, then, otherwise, PARENT + 1);
  }

  open<B extends Ops["blockKind"]>(
    open: CompilableOpen<Ops, B>
  ): BlockBuilder<Ops, B> {
    return this.#statements.open(open, PARENT + 1);
  }

  close<B extends Ops["blockKind"]>(block: Block<Ops, B>): void {
    this.#statements.close(block);
  }
}

export interface ReactiveArgument<T = unknown> {
  hydrate(state: ReactiveState): ReactiveValue<T>;
}

export class ReactiveStatic<T = unknown> implements ReactiveArgument<T> {
  #offset: number;
  #value: T;

  constructor(offset: number, value: T) {
    this.#offset = offset;
    this.#value = value;
  }

  get debugFields(): DebugFields {
    return new DebugFields("ReactiveStatic", {
      offset: this.#offset,
      value: this.#value,
    });
  }

  hydrate(): ReactiveValue<T> {
    return Const(this.#value);
  }
}

export class ReactiveDynamic<T = unknown> implements ReactiveArgument<T> {
  #key: string;

  constructor(key: string) {
    this.#key = key;
  }

  get debugFields(): DebugFields {
    return new DebugFields("ReactiveDynamic", {
      key: this.#key,
    });
  }

  hydrate(state: ReactiveState): ReactiveValue<T> {
    return state.dynamic[this.#key] as ReactiveValue<T>;
  }
}

export class ReactiveCall<A extends ReactiveValue[], B>
  implements ReactiveArgument<B> {
  #call: AnnotatedFunction<UserCall<A, B>>;
  #inputs: ReactiveArgumentsForValues<A>;

  constructor(
    call: AnnotatedFunction<UserCall<A, B>>,
    inputs: ReactiveArgumentsForValues<A>
  ) {
    this.#call = call;
    this.#inputs = inputs;
  }

  hydrate(state: ReactiveState): ReactiveValue<B> {
    let inputs = this.#inputs.map(input => input.hydrate(state)) as A;
    return Derived(() => this.#call.f(...inputs));
  }
}

export class ReactiveArguments<
  D extends Dict<ReactiveArgument> = Dict<ReactiveArgument>
> {
  #state: D;
  #constantValues: unknown[] = [];
  #constants: ReactiveStatic[] = [];

  constructor(dict: D) {
    this.#state = dict;
  }

  call<A extends ReactiveValue[], B>(
    f: AnnotatedFunction<UserCall<A, B>>,
    ...inputs: ReactiveArgumentsForValues<A>
  ): ReactiveCall<A, B> {
    return new ReactiveCall(f, inputs);
  }

  const<T>(value: T): ReactiveArgument<T> {
    if (this.#constantValues.includes(value)) {
      return this.#constants[
        this.#constantValues.indexOf(value)
      ] as ReactiveArgument<T>;
    } else {
      let offset = this.#constantValues.length;
      let constant = new ReactiveStatic(offset, value);
      this.#constantValues.push(value);
      this.#constants.push(constant);
      return constant;
    }
  }

  get<K extends keyof D>(key: K): D[K] {
    if (key in this.#state) {
      return this.#state[key] as D[K];
    } else {
      let arg = (new ReactiveDynamic(key as string) as unknown) as D[K];
      this.#state[key] = arg;
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

export type DictForReactiveArguments<
  A extends ReactiveArguments
> = A extends ReactiveArguments<infer R> ? R : never;

export type ReactiveInput<T extends ReactiveArgument> = (key: string) => T;
export type ReactiveInputs<T extends Dict<ReactiveArgument>> = {
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

export class ReactiveState<
  A extends Dict<ReactiveValue> = Dict<ReactiveValue>
> {
  #state: A;
  #constants: ReactiveValue[];

  constructor(state: A, constants: ReactiveValue[]) {
    this.#state = state;
    this.#constants = constants;
  }

  get dynamic(): A {
    return this.#state;
  }

  get constants(): readonly ReactiveValue[] {
    return this.#constants;
  }
}

export type DynamicRuntimeValues<D extends Dict<ReactiveArgument>> = {
  [P in keyof D]: D[P] extends ReactiveArgument<infer R>
    ? ReactiveValue<R>
    : never;
};

export function state(
  dict: Dict<ReactiveValue>,
  args: ReactiveArguments
): ReactiveState {
  return args.hydrate(dict);
}

// export type ReactiveArguments = Dict<ReactiveArgument<unknown>>;

export function program<Ops extends Operations>(
  args: ReactiveArguments,
  callback: (builder: ProgramBuilder<Ops>) => void
): (state: ReactiveState) => Evaluate<Ops> {
  return state => {
    let caller = callerFrame(PARENT);
    let builder = new ProgramBuilder<Ops>(args, caller);
    callback(builder);
    return builder.compile(state);
  };
}

export function Reactive<T>(): (key: string) => ReactiveDynamic<T> {
  return key => new ReactiveDynamic(key);
}
