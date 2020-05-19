import { ConditionBlock, invokeBlock, StaticBlock } from "../block-primitives";
import {
  annotate,
  AnnotatedFunction,
  caller,
  PARENT,
  Source,
} from "../debug/index";
import type {
  AppenderForCursor,
  Host,
  Operations,
  RegionAppender,
} from "../interfaces";
import type { Region } from "../region";
import type { Dict } from "../utils";
import type { Var } from "../value";
import type {
  ReactiveParameter,
  ReactiveParameters,
  ReactiveDict,
} from "./param";
import type { Compiler } from "./compiler";

export type RuntimeState = Dict<Var>;

export interface Compilable<Ops extends Operations> {
  compile(state: ReactiveState): Evaluate<Ops>;
}

export interface CompilerDelegate<Ops extends Operations> {
  appender(host: Host): AppenderForCursor<Ops>;

  intoAtom<A extends Ops["atom"]>(
    atom: Ops["defaultAtom"]
  ): CompilableAtom<Ops, A>;
}

export abstract class CompilableAtom<
  Ops extends Operations,
  _A extends Ops["atom"] = Ops["atom"]
> {
  abstract compile(state: ReactiveState): Evaluate<Ops>;
}

export type IntoCompilableAtom<Ops extends Operations> =
  | CompilableAtom<Ops>
  | Ops["defaultAtom"];

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
  atom(atom: IntoCompilableAtom<Ops>): void;

  /**
   * increment the directness parameter if calling an inner `ifBlock`
   */
  ifBlock<A extends ReactiveParameter<boolean>>(
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
  #condition: ReactiveParameter<boolean>;
  #then: CompilableBlock<Ops>;
  #else: CompilableBlock<Ops>;
  #source: Source;

  constructor(
    condition: ReactiveParameter<boolean>,
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
  #compiler: Compiler<Ops>;

  constructor(compiler: Compiler<Ops>) {
    this.#compiler = compiler;
  }

  done(): readonly Statement<Ops>[] {
    return this.#statements;
  }

  atom(atom: IntoCompilableAtom<Ops>): void {
    if (atom instanceof CompilableAtom) {
      this.#statements.push(atom);
    } else {
      this.#statements.push(this.#compiler.intoAtom(atom));
    }
  }

  /**
   * @param condition a reactive boolean
   * @param then a user block
   * @param otherwise a user block
   */
  ifBlock(
    condition: ReactiveParameter<boolean>,
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
    condition: ReactiveParameter<boolean>,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    source: Source = caller(PARENT)
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
    condition: ReactiveParameter<boolean>,
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

  ifBlock<A extends ReactiveParameter<boolean>>(
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
  #compiler: Compiler<Ops>;
  #statements: StatementsBuilder<Ops>;
  #source: Source;

  constructor(compiler: Compiler<Ops>, source: Source) {
    this.#compiler = compiler;
    this.#statements = new StatementsBuilder<Ops>(compiler);
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

  atom(atom: IntoCompilableAtom<Ops>): void {
    this.#statements.atom(atom);
  }

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Ops>,
    otherwise: UserBuilderBlock<Ops>,
    source = caller(PARENT)
  ): void {
    this.#statements.ifBlock(condition, then, otherwise, source);
  }
  open<ChildOps extends Operations>(
    adapter: CursorAdapter<Ops, ChildOps>
  ): ForeignBlockBuilder<Ops, ChildOps>;
  open<ChildOps extends Operations>(
    adapter: CursorAdapter<Ops, ChildOps>,
    head: (builder: ForeignBlockBuilder<Ops, ChildOps>) => void,
    body: (builder: BlockBodyBuilder<ChildOps, Ops>) => void
  ): void;
  open<ChildOps extends Operations>(
    adapter: CursorAdapter<Ops, ChildOps>,
    head?: (builder: ForeignBlockBuilder<Ops, ChildOps>) => void,
    body?: (builder: BlockBodyBuilder<ChildOps, Ops>) => void
  ): ForeignBlockBuilder<Ops, ChildOps> | void {
    if (head && body) {
      let open = this.#statements.open(adapter, this, caller(PARENT));
      head(open);
      let inner = open.flush();
      body(inner);
      inner.close();
    } else {
      return this.#statements.open(adapter, this, caller(PARENT));
    }
  }

  close(block: CompilableStaticBlock<Ops>): void {
    this.#statements.close(block);
  }
}

export class ReactiveState<A extends Dict<Var> = Dict<Var>> {
  #state: A;

  constructor(state: A) {
    this.#state = state;
  }

  get dynamic(): A {
    return this.#state;
  }
}

export function state<Params extends ReactiveParameters>(
  dict: Dict<Var>,
  params: Params
): ReactiveState {
  return params.hydrate(dict);
}

export type ProgramBlock<Ops extends Operations> = (
  state: ReactiveState
) => Evaluate<Ops>;

export function program<
  Ops extends Operations,
  Params extends ReactiveParameters = ReactiveParameters
>(
  compiler: Compiler<Ops, Params>,
  callback: (
    builder: Program<Ops>,
    callbackParams: ReactiveDict<Params>
  ) => void
): ProgramBlock<Ops> {
  return state => {
    let source = caller(PARENT);
    let builder = new Program<Ops>(compiler, source);
    callback(builder, compiler.params.dict as ReactiveDict<Params>);
    return builder.compile(state);
  };
}
