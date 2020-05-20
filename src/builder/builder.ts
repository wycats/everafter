import { invokeBlock } from "../block-primitives";
import {
  annotate,
  AnnotatedFunction,
  caller,
  PARENT,
  Source,
} from "../debug/index";
import type {
  Host,
  CompileOperations,
  AppendingReactiveRange,
} from "../interfaces";
import type { Region } from "../region";
import type { Dict } from "../utils";
import type { Var } from "../value";
// eslint-disable-next-line import/no-cycle
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

export abstract class CompilableAtom<Cursor, Atom> {
  abstract compile(state: ReactiveState): Evaluate<Cursor, Atom>;
}

export type Evaluate<Cursor, Atom, Out = void> = AnnotatedFunction<
  (region: Region<Cursor, Atom>, host: Host) => Out
>;

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
> {
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
  atom(atom: CompilableAtom<Cursor, Atom> | DefaultAtom): void;

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    source?: Source
  ): void;

  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>,
    parent?: Builder<Cursor, Atom, DefaultAtom>,
    source?: Source
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

export class StaticBlockBuilder<Cursor, Atom, DefaultAtom>
  implements Builder<Cursor, Atom, DefaultAtom> {
  #statements: Statement<Cursor, Atom>[] = [];
  #source: Source;
  #ops: CompileOperations<Cursor, Atom, DefaultAtom>;

  constructor(
    source: Source,
    ops: CompileOperations<Cursor, Atom, DefaultAtom>
  ) {
    this.#source = source;
    this.#ops = ops;
  }

  done(): CompilableStaticBlock<Cursor, Atom> {
    return new CompilableStaticBlock(this.#statements, this.#source);
  }

  invoke(compilableBlock: CompilableBlock<Cursor, Atom>): void {
    this.#statements.push({
      compile: (state: ReactiveState): Evaluate<Cursor, Atom> => {
        let block = compilableBlock.intoBlock(state);

        return annotate(
          (region: Region<Cursor, Atom>, host: Host) =>
            invokeBlock(block, region, host),
          this.#source
        );
      },
    });
  }

  atom(atom: CompilableAtom<Cursor, Atom> | DefaultAtom): void {
    if (atom instanceof CompilableAtom) {
      this.#statements.push(atom);
    } else {
      this.#statements.push(this.#ops.defaultAtom(atom));
    }
  }

  ifBlock(
    condition: ReactiveParameter<boolean>,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    source: Source = caller(PARENT)
  ): void {
    let cond = new Conditional(
      condition,
      CompilableStaticBlock.from(then, this.#ops),
      CompilableStaticBlock.from(otherwise, this.#ops),
      source
    );

    this.#statements.push(cond);
  }

  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>,
    parent: Builder<Cursor, Atom, DefaultAtom>,
    source: Source
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  > {
    return new ForeignBlockBuilder(parent, adapter, this.#ops, source);
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
> implements Builder<Cursor, Atom, DefaultAtom> {
  #parent: Builder<ParentCursor, ParentAtom, ParentDefaultAtom>;
  #adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>;
  #ops: CompileOperations<ParentCursor, ParentAtom, ParentDefaultAtom>;
  #builder: StaticBlockBuilder<Cursor, Atom, DefaultAtom>;
  #source: Source;

  constructor(
    parent: Builder<ParentCursor, ParentAtom, ParentDefaultAtom>,
    adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>,
    ops: CompileOperations<ParentCursor, ParentAtom, ParentDefaultAtom>,
    source: Source
  ) {
    this.#parent = parent;
    this.#adapter = adapter;
    this.#ops = ops;
    this.#builder = new StaticBlockBuilder(source, adapter.ops);
    this.#source = source;
  }

  atom(atom: CompilableAtom<Cursor, Atom> | DefaultAtom): void {
    this.#builder.atom(atom);
  }

  ifBlock(
    condition: ReactiveParameter<boolean>,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    source: Source
  ): void {
    this.#builder.ifBlock(condition, then, otherwise, source);
  }

  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>,
    parent: Builder<Cursor, Atom, DefaultAtom>,
    source: Source
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  > {
    return this.#builder.open(adapter, parent, source);
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
    return new BlockBodyBuilder(
      this.#parent,
      this.#builder.done(),
      this.#adapter,
      this.#ops,
      this.#source
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
> implements Builder<Cursor, Atom, DefaultAtom> {
  #parent: Builder<Cursor, Atom, DefaultAtom>;
  #head: CompilableBlock<HeadCursor, HeadAtom>;
  #adapter: CompileCursorAdapter<HeadCursor, HeadAtom, HeadDefaultAtom>;
  #builder: StaticBlockBuilder<Cursor, Atom, DefaultAtom>;
  #source: Source;

  constructor(
    parent: Builder<Cursor, Atom, DefaultAtom>,
    head: CompilableBlock<HeadCursor, HeadAtom>,
    adapter: CompileCursorAdapter<HeadCursor, HeadAtom, HeadDefaultAtom>,
    ops: CompileOperations<Cursor, Atom, DefaultAtom>,
    source: Source
  ) {
    this.#parent = parent;
    this.#head = head;
    this.#adapter = adapter;
    this.#builder = new StaticBlockBuilder(source, ops);
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

  atom(atom: CompilableAtom<Cursor, Atom> | DefaultAtom): void {
    this.#builder.atom(atom);
  }

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    source: Source
  ): void {
    this.#builder.ifBlock(condition, then, otherwise, source);
  }

  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>,
    parent: Builder<Cursor, Atom, DefaultAtom>,
    source: Source
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  > {
    return this.#builder.open(adapter, parent, source);
  }
}

export class Program<Cursor, Atom, DefaultAtom>
  implements Builder<Cursor, Atom, DefaultAtom>, Compilable<Cursor, Atom> {
  #statements: StaticBlockBuilder<Cursor, Atom, DefaultAtom>;

  constructor(
    ops: CompileOperations<Cursor, Atom, DefaultAtom>,
    source: Source
  ) {
    this.#statements = new StaticBlockBuilder(source, ops);
  }

  compile(state: ReactiveState): Evaluate<Cursor, Atom> {
    return this.#statements.done().compile(state);
  }

  atom(atom: CompilableAtom<Cursor, Atom> | DefaultAtom): void {
    this.#statements.atom(atom);
  }

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    otherwise: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    source = caller(PARENT)
  ): void {
    this.#statements.ifBlock(condition, then, otherwise, source);
  }
  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>
  ): ForeignBlockBuilder<
    Cursor,
    Atom,
    DefaultAtom,
    ChildCursor,
    ChildAtom,
    ChildDefaultAtom
  >;
  open<ChildCursor, ChildAtom, ChildDefaultAtom>(
    adapter: CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>,
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
    adapter: CompileCursorAdapter<ChildCursor, ChildAtom, ChildDefaultAtom>,
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
      let open = this.#statements.open(adapter, this, caller(PARENT));
      head(open);
      let inner = open.flush();
      body(inner);
      inner.close();
    } else {
      return this.#statements.open(adapter, this, caller(PARENT));
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
