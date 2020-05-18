import { ConditionBlock, StaticBlock } from "../block-primitives";
import {
  annotate,
  AnnotatedFunction,
  PARENT,
  Source,
  caller,
} from "../debug/index";
import type { Host, Operations } from "../interfaces";
import type { Region } from "../region";
import type { Dict } from "../utils";
import type { Var } from "../value";
import type { ReactiveArgument, ReactiveArguments } from "./argument";

export type RuntimeState = Dict<Var>;

export interface Compilable<Ops extends Operations> {
  compile(state: ReactiveState): Evaluate<Ops>;
}

export interface CompilableAtom<
  Ops extends Operations,
  _A extends Ops["atom"]
> {
  compile(state: ReactiveState): Evaluate<Ops>;
}

export interface CompilableOpen<
  Ops extends Operations,
  B extends Ops["block"] = Ops["block"]
> {
  compile(state: ReactiveState): Evaluate<Ops, B["open"]>;
}

export interface CompilableHead<
  Ops extends Operations,
  B extends Ops["block"]
> {
  compile(state: ReactiveState): Evaluate<Ops, B["head"]>;
}

export type Evaluate<Ops extends Operations, Out = void> = AnnotatedFunction<
  (region: Region<Ops>, host: Host) => Out
>;

type UserBuilderBlock<Ops extends Operations> = AnnotatedFunction<
  (builder: Builder<Ops>) => void
>;

interface Builder<Ops extends Operations> {
  atom(atom: CompilableAtom<Ops, Ops["atom"]>): void;

  /**
   * increment the directness parameter if calling an inner `ifBlock`
   */
  ifBlock<A extends ReactiveArgument<boolean>>(
    condition: A,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    caller?: Source
  ): void;
  /**
   * increment the directness parameter if calling an inner `open`
   */
  open<B extends Ops["block"]>(
    value: CompilableOpen<Ops, B>,
    directness: number
  ): BlockBuilder<Ops, B>;

  close<B extends Ops["block"]>(block: Block<Ops, B>): void;
}

class BlockBuilder<Ops extends Operations, B extends Ops["block"]> {
  #open: CompilableOpen<Ops, B>;
  #parent: Builder<Ops>;
  #head: CompilableHead<Ops, B>[] = [];
  #location: Source;

  constructor(
    open: CompilableOpen<Ops, B>,
    parent: Builder<Ops>,
    location: Source
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

class Block<Ops extends Operations, B extends Ops["block"]>
  implements Compilable<Ops> {
  #open: CompilableOpen<Ops, B>;
  #head: readonly CompilableHead<Ops, B>[];
  #statements: readonly Statement<Ops>[];
  #location: Source;

  constructor(
    open: CompilableOpen<Ops, B>,
    head: readonly CompilableHead<Ops, B>[],
    statements: readonly Statement<Ops>[],
    location: Source
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

    let func = (region: Region<Ops>, host: Host): void => {
      let buffer = region.open(open.f(region, host));

      for (let item of head) {
        region.updateWith(buffer.head(item.f(region, host)));
      }

      buffer.flush();

      for (let item of body) {
        item.f(region, host);
      }

      buffer.close();
    };

    return annotate(func, this.#location);
  }
}

class Conditional<Ops extends Operations> implements Compilable<Ops> {
  #condition: ReactiveArgument<boolean>;
  #then: CompilableBlock<Ops>;
  #else: CompilableBlock<Ops>;
  #source: Source;

  constructor(
    condition: ReactiveArgument<boolean>,
    then: CompilableBlock<Ops>,
    otherwise: CompilableBlock<Ops>,
    location: Source
  ) {
    this.#condition = condition;
    this.#then = then;
    this.#else = otherwise;
    this.#source = location;
  }

  compile(state: ReactiveState): Evaluate<Ops> {
    let condition = this.#condition.hydrate(state);
    let then = this.#then.compile(state);
    let otherwise = this.#else.compile(state);

    let func = (output: Region<Ops>): void => {
      let cond = new ConditionBlock<Ops>(
        condition,
        then,
        otherwise,
        this.#source
      );

      output.renderBlock(cond);
    };

    return annotate(func, this.#source);
  }
}

export type Statement<Ops extends Operations> = Compilable<Ops>;

export class StatementsBuilder<Ops extends Operations> implements Builder<Ops> {
  #statements: Statement<Ops>[] = [];

  done(): readonly Statement<Ops>[] {
    return this.#statements;
  }

  atom(atom: CompilableAtom<Ops, Ops["atom"]>): void {
    this.#statements.push(atom);
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
    source: Source
  ): void {
    let thenBlock = CompilableBlock.from(then);
    let otherwiseBlock = CompilableBlock.from(otherwise);

    this.#statements.push(
      new Conditional(condition, thenBlock, otherwiseBlock, source)
    );
  }

  open<B extends Ops["block"]>(
    open: CompilableOpen<Ops, B>,
    directness: number
  ): BlockBuilder<Ops, B> {
    let location = caller(directness);
    return new BlockBuilder(open, this, location);
  }

  close<B extends Ops["block"]>(block: Block<Ops, B>): void {
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
  #source: Source;

  constructor(statements: readonly Statement<Ops>[], source: Source) {
    this.#statements = statements;
    this.#source = source;
  }

  compile(state: ReactiveState): StaticBlock<Ops> {
    let statements = this.#statements.map(s => s.compile(state));

    let func = annotate((output: Region<Ops>, host: Host): void => {
      for (let statement of statements) {
        statement.f(output, host);
      }
    }, this.#source);

    return new StaticBlock(func);
  }
}

class StaticBlockBuilder<Ops extends Operations> implements Builder<Ops> {
  #statements: Statement<Ops>[] = [];

  done(): readonly Statement<Ops>[] {
    return this.#statements;
  }

  atom(atom: CompilableAtom<Ops, Ops["atom"]>): void {
    this.#statements.push(atom);
  }

  ifBlock(
    condition: ReactiveArgument<boolean>,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    source: Source
  ): void {
    let cond = new Conditional(
      condition,
      CompilableBlock.from(then),
      CompilableBlock.from(otherwise),
      source
    );

    this.#statements.push(cond);
  }

  open<B extends Ops["block"]>(
    open: CompilableOpen<Ops, B>
  ): BlockBuilder<Ops, B> {
    return new BlockBuilder(open, this, caller(PARENT));
  }

  close<B extends Ops["block"]>(block: Block<Ops, B>): void {
    this.#statements.push(block);
  }
}

class BlockBodyBuilder<Ops extends Operations, B extends Ops["block"]>
  implements Builder<Ops> {
  #open: CompilableOpen<Ops, B>;
  #parent: Builder<Ops>;
  #head: readonly CompilableHead<Ops, B>[];
  #source: Source;
  #builder = new StatementsBuilder<Ops>();

  constructor(
    open: CompilableOpen<Ops, B>,
    parent: Builder<Ops>,
    head: readonly CompilableHead<Ops, B>[],
    source: Source
  ) {
    this.#open = open;
    this.#parent = parent;
    this.#head = head;
    this.#source = source;
  }

  done(): Block<Ops, B> {
    return new Block(
      this.#open,
      this.#head,
      this.#builder.done(),
      this.#source
    );
  }

  close(): void {
    this.#parent.close(this.done());
  }

  atom(atom: CompilableAtom<Ops, Ops["atom"]>): void {
    this.#builder.atom(atom);
  }

  ifBlock(
    condition: ReactiveArgument<boolean>,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    source = caller(PARENT)
  ): void {
    this.#builder.ifBlock(condition, then, otherwise, source);
  }

  open<B extends Ops["block"]>(
    open: CompilableOpen<Ops, B>,
    directness: number
  ): BlockBuilder<Ops, B> {
    return this.#builder.open(open, directness + 1);
  }
}

export class Program<Ops extends Operations>
  implements Builder<Ops>, Compilable<Ops> {
  #statements = new StatementsBuilder<Ops>();
  #source: Source;

  constructor(source: Source) {
    this.#source = source;
  }

  compile(state: ReactiveState): Evaluate<Ops> {
    let statements = this.#statements.done().map(s => s.compile(state));

    let func = (output: Region<Ops>, host: Host): void => {
      for (let statement of statements) {
        statement.f(output, host);
      }
    };

    return annotate(func, this.#source);
  }

  atom(atom: CompilableAtom<Ops, Ops["atom"]>): void {
    this.#statements.atom(atom);
  }

  ifBlock<A extends ReactiveArgument<boolean>>(
    condition: A,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    source = caller(PARENT)
  ): void {
    this.#statements.ifBlock(condition, then, otherwise, source);
  }

  open<B extends Ops["block"]>(
    open: CompilableOpen<Ops, B>
  ): BlockBuilder<Ops, B> {
    return this.#statements.open(open, PARENT + 1);
  }

  close<B extends Ops["block"]>(block: Block<Ops, B>): void {
    this.#statements.close(block);
  }
}

export class ReactiveState<A extends Dict<Var> = Dict<Var>> {
  #state: A;
  #constants: Var[];

  constructor(state: A, constants: Var[]) {
    this.#state = state;
    this.#constants = constants;
  }

  get dynamic(): A {
    return this.#state;
  }

  get constants(): readonly Var[] {
    return this.#constants;
  }
}

export function state(dict: Dict<Var>, args: ReactiveArguments): ReactiveState {
  return args.hydrate(dict);
}

// export type ReactiveArguments = Dict<ReactiveArgument<unknown>>;

export function program<Ops extends Operations>(
  callback: (builder: Program<Ops>) => void
): (state: ReactiveState) => Evaluate<Ops> {
  return state => {
    let source = caller(PARENT);
    let builder = new Program<Ops>(source);
    callback(builder);
    return builder.compile(state);
  };
}
