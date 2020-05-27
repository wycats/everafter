import { invokeBlock } from "../block-primitives";
import {
  caller,
  DEBUG,
  Debuggable,
  PARENT,
  setDefaultSource,
  Source,
  Structured,
} from "../debug";
import type { AppendingReactiveRange, CompileOperations } from "../interfaces";
import { Factory, getOwner, Owned, Owner } from "../owner";
import type { Region } from "../region";
import type { Dict } from "../utils";
import type { Var } from "../value";
import {
  CompilableBlock,
  CompilableStaticBlock,
  Conditional,
  ForeignBlock,
  UserBuilderBlock,
} from "./blocks";
import type { ReactiveParameter } from "./param";

export type RuntimeState = Dict<Var>;

export interface Compilable<Cursor, Atom> {
  compile(state: ReactiveState): Evaluate<Cursor, Atom>;
}

export abstract class CompilableAtom<Cursor, Atom> extends Owned
  implements Compilable<Cursor, Atom>, Debuggable {
  declare __proto__: CompilableAtom<Cursor, Atom>;
  abstract compile(state: ReactiveState): Evaluate<Cursor, Atom>;
  abstract [DEBUG](): Structured;
}

export type Evaluate<Cursor, Atom, Out = void> = (
  region: Region<Cursor, Atom>
) => Out;

export interface CompileCursorAdapter<
  Cursor,
  Atom,
  DefaultAtom,
  Left extends AppendingReactiveRange<Cursor, Atom> = AppendingReactiveRange<
    Cursor,
    Atom
  >,
  Right extends AppendingReactiveRange<
    unknown,
    unknown
  > = AppendingReactiveRange<unknown, unknown>
  > extends Owned {
  ops: CompileOperations<Cursor, Atom, DefaultAtom>;
  runtime: CursorAdapter<Left, Right>;
}

export interface CursorAdapter<
  Left extends AppendingReactiveRange<
    unknown,
    unknown
  > = AppendingReactiveRange<unknown, unknown>,
  Right extends AppendingReactiveRange<
    unknown,
    unknown
  > = AppendingReactiveRange<unknown, unknown>
  > {
  child(left: Left): Right;

  flush(parent: Left, child: ReturnType<Right["finalize"]>): Left;
}

export interface Builder<Cursor, Atom, DefaultAtom> {
  atom(
    atom: Factory<CompilableAtom<Cursor, Atom>> | DefaultAtom,
    source: Source
  ): void;

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    source?: Source
  ): void;

  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: Factory<
      CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>
    >,
    parent?: Builder<Cursor, Atom, DefaultAtom>
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  >;

  close(block: CompilableBlock<Cursor, Atom>): void;
}

export type Statement<Cursor, Atom> = Compilable<Cursor, Atom>;

export class StaticBlockBuilder<Cursor, Atom, DefaultAtom> extends Owned
  implements Builder<Cursor, Atom, DefaultAtom> {
  #statements: Statement<Cursor, Atom>[] = [];
  #ops: CompileOperations<Cursor, Atom, DefaultAtom>;

  constructor(owner: Owner, ops: CompileOperations<Cursor, Atom, DefaultAtom>) {
    super(owner);
    this.#ops = ops;
  }

  done(): CompilableStaticBlock<Cursor, Atom> {
    return this.new(CompilableStaticBlock, this.#statements);
  }

  invoke(compilableBlock: CompilableBlock<Cursor, Atom>): void {
    this.#statements.push({
      compile: (state: ReactiveState): Evaluate<Cursor, Atom> => {
        let block = compilableBlock.intoBlock(state);

        return (region: Region<Cursor, Atom>) => invokeBlock(block, region);
      },
    });
  }

  atom(
    factory: Factory<CompilableAtom<Cursor, Atom>> | DefaultAtom,
    source = caller(PARENT)
  ): void {
    let atom =
      typeof factory === "function"
        ? getOwner(this).instantiate(
          factory as Factory<CompilableAtom<Cursor, Atom>>
        )
        : factory;

    let statement =
      atom instanceof CompilableAtom
        ? atom
        : getOwner(this).instantiate(this.#ops.defaultAtom(atom));

    setDefaultSource(statement, source);

    this.#statements.push(statement);
  }

  ifBlock(
    condition: ReactiveParameter<boolean>,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    source = caller(PARENT).withDefaultDescription("if")
  ): void {
    let cond = new Conditional(
      condition,
      getOwner(this).instantiate(CompilableStaticBlock.from, then, this.#ops),
      getOwner(this).instantiate(
        CompilableStaticBlock.from,
        otherwise,
        this.#ops
      )
    );

    setDefaultSource(cond, source);
    this.#statements.push(cond);
  }

  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: Factory<
      CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>
    >,
    parent: Builder<Cursor, Atom, DefaultAtom>
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  > {
    return this.new(
      ForeignBlockBuilder,
      parent,
      getOwner(this).instantiate(adapter),
      this.#ops
    );
  }

  close(block: CompilableStaticBlock<Cursor, Atom>): void {
    this.#statements.push(block);
  }
}

class ForeignBlockBuilder<
  ParentCursor,
  ParentAtom,
  ParentDefaultAtom,
  Cursor,
  Atom,
  DefaultAtom
  > extends Owned implements Builder<Cursor, Atom, DefaultAtom> {
  #parent: Builder<ParentCursor, ParentAtom, ParentDefaultAtom>;
  #adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>;
  #ops: CompileOperations<ParentCursor, ParentAtom, ParentDefaultAtom>;
  #builder: StaticBlockBuilder<Cursor, Atom, DefaultAtom>;

  constructor(
    owner: Owner,
    parent: Builder<ParentCursor, ParentAtom, ParentDefaultAtom>,
    adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>,
    ops: CompileOperations<ParentCursor, ParentAtom, ParentDefaultAtom>
  ) {
    super(owner);
    this.#parent = parent;
    this.#adapter = adapter;
    this.#ops = ops;
    this.#builder = owner.new(StaticBlockBuilder, adapter.ops);
  }

  atom(
    atom: Factory<CompilableAtom<Cursor, Atom>> | DefaultAtom,
    source: Source = caller(PARENT)
  ): void {
    this.#builder.atom(atom, source);
  }

  ifBlock(
    condition: ReactiveParameter<boolean>,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    source = caller(PARENT)
  ): void {
    this.#builder.ifBlock(condition, then, otherwise, source);
  }

  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: Factory<
      CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>
    >,
    parent: Builder<Cursor, Atom, DefaultAtom>
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  > {
    return this.#builder.open(adapter, parent);
  }

  close(block: CompilableStaticBlock<Cursor, Atom>): void {
    this.#builder.close(block);
  }

  flush(): BlockBodyBuilder<
    ParentCursor,
    ParentAtom,
    ParentDefaultAtom,
    Cursor,
    Atom,
    DefaultAtom
  > {
    return this.new(
      BlockBodyBuilder,
      this.#parent,
      this.#builder.done(),
      this.#adapter,
      this.#ops
    );
  }
}

class BlockBodyBuilder<
  Cursor,
  Atom,
  DefaultAtom,
  HeadCursor,
  HeadAtom,
  HeadDefaultAtom
  > extends Owned implements Builder<Cursor, Atom, DefaultAtom> {
  #parent: Builder<Cursor, Atom, DefaultAtom>;
  #head: CompilableBlock<HeadCursor, HeadAtom>;
  #adapter: CompileCursorAdapter<HeadCursor, HeadAtom, HeadDefaultAtom>;
  #builder: StaticBlockBuilder<Cursor, Atom, DefaultAtom>;

  constructor(
    owner: Owner,
    parent: Builder<Cursor, Atom, DefaultAtom>,
    head: CompilableBlock<HeadCursor, HeadAtom>,
    adapter: CompileCursorAdapter<HeadCursor, HeadAtom, HeadDefaultAtom>,
    ops: CompileOperations<Cursor, Atom, DefaultAtom>
  ) {
    super(owner);
    this.#parent = parent;
    this.#head = head;
    this.#adapter = adapter;
    this.#builder = owner.new(StaticBlockBuilder, ops);
  }

  close(): void {
    let block = this.new(
      ForeignBlock,
      this.#head,
      this.#builder.done(),
      this.#adapter
    );

    this.#parent.close(block);
  }

  atom(atom: Factory<CompilableAtom<Cursor, Atom>> | DefaultAtom): void {
    this.#builder.atom(atom);
  }

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>
  ): void {
    this.#builder.ifBlock(condition, then, otherwise);
  }

  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: Factory<
      CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>
    >,
    parent: Builder<Cursor, Atom, DefaultAtom>
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  > {
    return this.#builder.open(adapter, parent);
  }
}

export class Program<Cursor, Atom, DefaultAtom> extends Owned
  implements Builder<Cursor, Atom, DefaultAtom>, Compilable<Cursor, Atom> {
  #statements: StaticBlockBuilder<Cursor, Atom, DefaultAtom>;

  constructor(owner: Owner, ops: CompileOperations<Cursor, Atom, DefaultAtom>) {
    super(owner);
    this.#statements = owner.new(StaticBlockBuilder, ops);
  }

  compile(state: ReactiveState): Evaluate<Cursor, Atom> {
    return this.#statements.done().compile(state);
  }

  atom(
    atom: Factory<CompilableAtom<Cursor, Atom>> | DefaultAtom,
    source = caller(PARENT)
  ): void {
    this.#statements.atom(atom, source);
  }

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    source = caller(PARENT).withDefaultDescription("if")
  ): void {
    this.#statements.ifBlock(condition, then, otherwise, source);
  }

  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: Factory<
      CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>
    >
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  >;
  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: Factory<
      CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>
    >,
    head: (
      builder: ForeignBlockBuilder<
        Cursor,
        Atom,
        DefaultAtom,
        ChildCursor,
        ChildAtom,
        ChildDefaultAtom
      >
    ) => void,
    body: (
      builder: BlockBodyBuilder<
        Cursor,
        Atom,
        DefaultAtom,
        ChildCursor,
        ChildAtom,
        ChildDefaultAtom
      >
    ) => void
  ): void;
  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: Factory<
      CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>
    >,
    head?: (
      builder: ForeignBlockBuilder<
        Cursor,
        Atom,
        DefaultAtom,
        ChildCursor,
        ChildAtom,
        ChildDefaultAtom
      >
    ) => void,
    body?: (
      builder: BlockBodyBuilder<
        Cursor,
        Atom,
        DefaultAtom,
        ChildCursor,
        ChildAtom,
        ChildDefaultAtom
      >
    ) => void
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  > | void {
    if (head && body) {
      let open = this.#statements.open(adapter, this);
      head(open);
      let inner = open.flush();
      body(inner);
      inner.close();
    } else {
      return this.#statements.open(adapter, this);
    }
  }

  close(block: CompilableStaticBlock<Cursor, Atom>): void {
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

export type ProgramBlock<Cursor, Atom> = (
  state: ReactiveState
) => Evaluate<Cursor, Atom>;
