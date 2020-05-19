import { ConditionBlock, StaticBlock, invokeBlock } from "../block-primitives";
import {
  annotate,
  AnnotatedFunction,
  PARENT,
  Source,
  caller,
} from "../debug/index";
import type { Host, Operations, RegionAppender } from "../interfaces";
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

export type Evaluate<Ops extends Operations, Out = void> = AnnotatedFunction<
  (region: Region<Ops>, host: Host) => Out
>;

type UserBuilderBlock<Ops extends Operations> = AnnotatedFunction<
  (builder: StaticBlockBuilder<Ops>) => void
>;

export interface CursorAdapter<O1 extends Operations, O2 extends Operations> {
  child(cursor: O1["cursor"]): RegionAppender<O2>;
  flush(parent: O1["cursor"], child: O2["cursor"]): RegionAppender<O1>;
}

interface Builder<Ops extends Operations> {
  atom(atom: CompilableAtom<Ops, Ops["atom"]>): void;

  /**
   * increment the directness parameter if calling an inner `ifBlock`
   */
  ifBlock<A extends ReactiveArgument<boolean>>(
    condition: A,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    source?: Source
  ): void;

  open<ChildOps extends Operations>(
    adapter: CursorAdapter<Ops, ChildOps>,
    parent?: Builder<Ops>,
    source?: Source
  ): ForeignBlockBuilder<Ops, ChildOps>;

  close(block: CompilableBlock<Ops>): void;
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
    let then = this.#then.intoBlock(state);
    let otherwise = this.#else.intoBlock(state);

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
    let thenBlock = CompilableStaticBlock.from(then);
    let otherwiseBlock = CompilableStaticBlock.from(otherwise);

    this.#statements.push(
      new Conditional(condition, thenBlock, otherwiseBlock, source)
    );
  }

  open<ChildOps extends Operations>(
    adapter: CursorAdapter<Ops, ChildOps>,
    parent: Builder<Ops>,
    source: Source
  ): ForeignBlockBuilder<Ops, ChildOps> {
    return new ForeignBlockBuilder(parent, adapter, source);
  }

  close(block: CompilableStaticBlock<Ops>): void {
    this.#statements.push(block);
  }
}

interface CompilableBlock<Ops extends Operations> {
  intoBlock(state: ReactiveState): StaticBlock<Ops>;
}

class CompilableStaticBlock<Ops extends Operations>
  implements CompilableBlock<Ops>, Compilable<Ops> {
  static from<Ops extends Operations>(
    block: UserBuilderBlock<Ops>
  ): CompilableBlock<Ops> {
    let builder = new StaticBlockBuilder<Ops>(block.source);
    block.f(builder);
    return builder.done();
  }

  #statements: readonly Statement<Ops>[];
  #source: Source;

  constructor(statements: readonly Statement<Ops>[], source: Source) {
    this.#statements = statements;
    this.#source = source;
  }

  compile(state: ReactiveState<Dict<Var<unknown>>>): Evaluate<Ops, void> {
    let block = this.intoBlock(state);

    return annotate((region, host) => {
      invokeBlock(block, region, host);
    }, this.#source);
  }

  intoBlock(state: ReactiveState): StaticBlock<Ops> {
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
  #source: Source;

  constructor(source: Source) {
    this.#source = source;
  }

  done(): CompilableStaticBlock<Ops> {
    return new CompilableStaticBlock(this.#statements, this.#source);
  }

  invoke(compilableBlock: CompilableBlock<Ops>): void {
    this.#statements.push({
      compile: (state: ReactiveState): Evaluate<Ops> => {
        let block = compilableBlock.intoBlock(state);

        return annotate(
          (region: Region<Ops>, host: Host) => invokeBlock(block, region, host),
          this.#source
        );
      },
    });
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
      CompilableStaticBlock.from(then),
      CompilableStaticBlock.from(otherwise),
      source
    );

    this.#statements.push(cond);
  }

  open<ChildOps extends Operations>(
    adapter: CursorAdapter<Ops, ChildOps>,
    parent: Builder<Ops>,
    source: Source
  ): ForeignBlockBuilder<Ops, ChildOps> {
    return new ForeignBlockBuilder(parent, adapter, source);
  }

  close(block: CompilableStaticBlock<Ops>): void {
    this.#statements.push(block);
  }
}

class ForeignBlock<ParentOps extends Operations, Ops extends Operations>
  implements CompilableBlock<ParentOps>, Compilable<ParentOps> {
  static from<Ops extends Operations>(
    block: UserBuilderBlock<Ops>
  ): CompilableBlock<Ops> {
    let builder = new StaticBlockBuilder<Ops>(block.source);
    block.f(builder);
    return builder.done();
  }

  #head: CompilableBlock<Ops>;
  #body: CompilableBlock<ParentOps>;
  #adapter: CursorAdapter<ParentOps, Ops>;
  #source: Source;

  constructor(
    head: CompilableBlock<Ops>,
    body: CompilableBlock<ParentOps>,
    adapter: CursorAdapter<ParentOps, Ops>,
    source: Source
  ) {
    this.#head = head;
    this.#body = body;
    this.#adapter = adapter;
    this.#source = source;
  }

  compile(state: ReactiveState): Evaluate<ParentOps, void> {
    let block = this.intoBlock(state);

    return annotate((region, host) => {
      invokeBlock(block, region, host);
    }, this.#source);
  }

  intoBlock(state: ReactiveState): StaticBlock<ParentOps> {
    let head = this.#head.intoBlock(state);
    let body = this.#body.intoBlock(state);

    let func = annotate((region: Region<ParentOps>, host: Host): void => {
      let child = region.open(this.#adapter);

      invokeBlock(head, child, host);
      let grandchild = region.flush(this.#adapter, child);
      invokeBlock(body, grandchild, host);
    }, this.#source);

    return new StaticBlock(func);
  }
}

class ForeignBlockBuilder<ParentOps extends Operations, Ops extends Operations>
  implements Builder<Ops> {
  #parent: Builder<ParentOps>;
  #builder: StaticBlockBuilder<Ops>;
  #adapter: CursorAdapter<ParentOps, Ops>;
  #source: Source;

  constructor(
    parent: Builder<ParentOps>,
    adapter: CursorAdapter<ParentOps, Ops>,
    source: Source
  ) {
    this.#parent = parent;
    this.#adapter = adapter;
    this.#builder = new StaticBlockBuilder(source);
    this.#source = source;
  }

  atom(atom: CompilableAtom<Ops, Ops["atom"]>): void {
    this.#builder.atom(atom);
  }

  ifBlock(
    condition: ReactiveArgument<boolean>,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    source: Source
  ): void {
    this.#builder.ifBlock(condition, then, otherwise, source);
  }

  open<ChildOps extends Operations>(
    adapter: CursorAdapter<Ops, ChildOps>,
    parent: Builder<Ops>,
    source: Source
  ): ForeignBlockBuilder<Ops, ChildOps> {
    return this.#builder.open(adapter, parent, source);
  }

  close(block: CompilableStaticBlock<Ops>): void {
    this.#builder.close(block);
  }

  flush(): BlockBodyBuilder<Ops, ParentOps> {
    return new BlockBodyBuilder(
      this.#parent,
      this.#builder.done(),
      this.#adapter,
      this.#source
    );
  }
}

class BlockBodyBuilder<HeadOps extends Operations, Ops extends Operations>
  implements Builder<Ops> {
  #parent: Builder<Ops>;
  #head: CompilableBlock<HeadOps>;
  #adapter: CursorAdapter<Ops, HeadOps>;
  #builder: StaticBlockBuilder<Ops>;
  #source: Source;

  constructor(
    parent: Builder<Ops>,
    head: CompilableBlock<HeadOps>,
    adapter: CursorAdapter<Ops, HeadOps>,
    source: Source
  ) {
    this.#parent = parent;
    this.#head = head;
    this.#adapter = adapter;
    this.#builder = new StaticBlockBuilder(source);
    this.#source = source;
  }

  close(): void {
    let block = new ForeignBlock(
      this.#head,
      this.#builder.done(),
      this.#adapter,
      this.#source
    );

    this.#parent.close(block);
  }

  atom(atom: CompilableAtom<Ops, Ops["atom"]>): void {
    this.#builder.atom(atom);
  }

  ifBlock<A extends ReactiveArgument<boolean>>(
    condition: A,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    source: Source
  ): void {
    this.#builder.ifBlock(condition, then, otherwise, source);
  }

  open<ChildOps extends Operations>(
    adapter: CursorAdapter<Ops, ChildOps>,
    parent: Builder<Ops>,
    source: Source
  ): ForeignBlockBuilder<Ops, ChildOps> {
    return this.#builder.open(adapter, parent, source);
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

  open<ChildOps extends Operations>(
    adapter: CursorAdapter<Ops, ChildOps>
  ): ForeignBlockBuilder<Ops, ChildOps> {
    return this.#statements.open(adapter, this, caller(PARENT));
  }

  close(block: CompilableStaticBlock<Ops>): void {
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

export type ProgramBlock<Ops extends Operations> = (
  state: ReactiveState
) => Evaluate<Ops>;

export function program<Ops extends Operations>(
  callback: (builder: Program<Ops>) => void
): ProgramBlock<Ops> {
  return state => {
    let source = caller(PARENT);
    let builder = new Program<Ops>(source);
    callback(builder);
    return builder.compile(state);
  };
}
