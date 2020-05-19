import { invokeBlock } from "../block-primitives";
import {
  annotate,
  AnnotatedFunction,
  caller,
  PARENT,
  Source,
} from "../debug/index";
import type { Host, RegionAppender } from "../interfaces";
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

export interface CursorAdapter<Cursor1, Atom1, Cursor2, Atom2> {
  child(cursor: Cursor1): RegionAppender<Cursor2, Atom2>;
  // TODO: child should be a range
  flush(parent: Cursor1, child: Cursor2): RegionAppender<Cursor1, Atom1>;
}

export interface Builder<Cursor, Atom> {
  atom(atom: CompilableAtom<Cursor, Atom>): void;

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Cursor, Atom>,
    otherwise: UserBuilderBlock<Cursor, Atom>,
    source?: Source
  ): void;

  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<Cursor, Atom, ChildCursor, ChildAtom>,
    parent?: Builder<Cursor, Atom>,
    source?: Source
  ): ForeignBlockBuilder<Cursor, Atom, ChildCursor, ChildAtom>;

  close(block: CompilableBlock<Cursor, Atom>): void;
}

export type Statement<Cursor, Atom> = Compilable<Cursor, Atom>;

// export class StatementsBuilder<Ops extends Operations> implements Builder<Ops> {
//   #statements: Statement<Ops>[] = [];
//   #compiler: Compiler<Ops>;

//   constructor(compiler: Compiler<Ops>) {
//     this.#compiler = compiler;
//   }

//   done(): readonly Statement<Ops>[] {
//     return this.#statements;
//   }

//   atom(atom: IntoCompilableAtom<Ops>): void {
//     if (atom instanceof CompilableAtom) {
//       this.#statements.push(atom);
//     } else {
//       this.#statements.push(this.#compiler.intoAtom(atom));
//     }
//   }

//   /**
//    * @param condition a reactive boolean
//    * @param then a user block
//    * @param otherwise a user block
//    */
//   ifBlock(
//     condition: ReactiveParameter<boolean>,
//     then: UserBuilderBlock<Ops>,
//     otherwise: UserBuilderBlock<Ops>,
//     source: Source
//   ): void {
//     let thenBlock = CompilableStaticBlock.from(then);
//     let otherwiseBlock = CompilableStaticBlock.from(otherwise);

//     this.#statements.push(
//       new Conditional(condition, thenBlock, otherwiseBlock, source)
//     );
//   }

//   open<ChildOps extends Operations>(
//     adapter: CursorAdapter<Ops, ChildOps>,
//     parent: Builder<Ops>,
//     source: Source
//   ): ForeignBlockBuilder<Ops, ChildOps> {
//     return new ForeignBlockBuilder(parent, adapter, source);
//   }

//   close(block: CompilableStaticBlock<Ops>): void {
//     this.#statements.push(block);
//   }
// }

export class StaticBlockBuilder<Cursor, Atom> implements Builder<Cursor, Atom> {
  #statements: Statement<Cursor, Atom>[] = [];
  #source: Source;

  constructor(source: Source) {
    this.#source = source;
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

  atom(atom: CompilableAtom<Cursor, Atom>): void {
    this.#statements.push(atom);
  }

  ifBlock(
    condition: ReactiveParameter<boolean>,
    then: UserBuilderBlock<Cursor, Atom>,
    otherwise: UserBuilderBlock<Cursor, Atom>,
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

  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<Cursor, Atom, ChildCursor, ChildAtom>,
    parent: Builder<Cursor, Atom>,
    source: Source
  ): ForeignBlockBuilder<Cursor, Atom, ChildCursor, ChildAtom> {
    return new ForeignBlockBuilder(parent, adapter, source);
  }

  close(block: CompilableStaticBlock<Cursor, Atom>): void {
    this.#statements.push(block);
  }
}

class ForeignBlockBuilder<ParentCursor, ParentAtom, Cursor, Atom>
  implements Builder<Cursor, Atom> {
  #parent: Builder<ParentCursor, ParentAtom>;
  #builder: StaticBlockBuilder<Cursor, Atom>;
  #adapter: CursorAdapter<ParentCursor, ParentAtom, Cursor, Atom>;
  #source: Source;

  constructor(
    parent: Builder<ParentCursor, ParentAtom>,
    adapter: CursorAdapter<ParentCursor, ParentAtom, Cursor, Atom>,
    source: Source
  ) {
    this.#parent = parent;
    this.#adapter = adapter;
    this.#builder = new StaticBlockBuilder(source);
    this.#source = source;
  }

  atom(atom: CompilableAtom<Cursor, Atom>): void {
    this.#builder.atom(atom);
  }

  ifBlock(
    condition: ReactiveParameter<boolean>,
    then: UserBuilderBlock<Cursor, Atom>,
    otherwise: UserBuilderBlock<Cursor, Atom>,
    source: Source
  ): void {
    this.#builder.ifBlock(condition, then, otherwise, source);
  }

  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<Cursor, Atom, ChildCursor, ChildAtom>,
    parent: Builder<Cursor, Atom>,
    source: Source
  ): ForeignBlockBuilder<Cursor, Atom, ChildCursor, ChildAtom> {
    return this.#builder.open(adapter, parent, source);
  }

  close(block: CompilableStaticBlock<Cursor, Atom>): void {
    this.#builder.close(block);
  }

  flush(): BlockBodyBuilder<ParentCursor, ParentAtom, Cursor, Atom> {
    return new BlockBodyBuilder(
      this.#parent,
      this.#builder.done(),
      this.#adapter,
      this.#source
    );
  }
}

class BlockBodyBuilder<Cursor, Atom, HeadCursor, HeadAtom>
  implements Builder<Cursor, Atom> {
  #parent: Builder<Cursor, Atom>;
  #head: CompilableBlock<HeadCursor, HeadAtom>;
  #adapter: CursorAdapter<Cursor, Atom, HeadCursor, HeadAtom>;
  #builder: StaticBlockBuilder<Cursor, Atom>;
  #source: Source;

  constructor(
    parent: Builder<Cursor, Atom>,
    head: CompilableBlock<HeadCursor, HeadAtom>,
    adapter: CursorAdapter<Cursor, Atom, HeadCursor, HeadAtom>,
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

  atom(atom: CompilableAtom<Cursor, Atom>): void {
    this.#builder.atom(atom);
  }

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Cursor, Atom>,
    otherwise: UserBuilderBlock<Cursor, Atom>,
    source: Source
  ): void {
    this.#builder.ifBlock(condition, then, otherwise, source);
  }

  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<Cursor, Atom, ChildCursor, ChildAtom>,
    parent: Builder<Cursor, Atom>,
    source: Source
  ): ForeignBlockBuilder<Cursor, Atom, ChildCursor, ChildAtom> {
    return this.#builder.open(adapter, parent, source);
  }
}

export class Program<Cursor, Atom>
  implements Builder<Cursor, Atom>, Compilable<Cursor, Atom> {
  #statements: StaticBlockBuilder<Cursor, Atom>;

  constructor(source: Source) {
    this.#statements = new StaticBlockBuilder<Cursor, Atom>(source);
  }

  compile(state: ReactiveState): Evaluate<Cursor, Atom> {
    return this.#statements.done().compile(state);
  }

  atom(atom: CompilableAtom<Cursor, Atom>): void {
    this.#statements.atom(atom);
  }

  ifBlock<A extends ReactiveParameter<boolean>>(
    condition: A,
    then: UserBuilderBlock<Cursor, Atom>,
    otherwise: UserBuilderBlock<Cursor, Atom>,
    source = caller(PARENT)
  ): void {
    this.#statements.ifBlock(condition, then, otherwise, source);
  }
  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<Cursor, Atom, ChildCursor, ChildAtom>
  ): ForeignBlockBuilder<Cursor, Atom, ChildCursor, ChildAtom>;
  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<Cursor, Atom, ChildCursor, ChildAtom>,
    head: (
      builder: ForeignBlockBuilder<Cursor, Atom, ChildCursor, ChildAtom>
    ) => void,
    body: (
      builder: BlockBodyBuilder<Cursor, Atom, ChildCursor, ChildAtom>
    ) => void
  ): void;
  open<ChildCursor, ChildAtom>(
    adapter: CursorAdapter<Cursor, Atom, ChildCursor, ChildAtom>,
    head?: (
      builder: ForeignBlockBuilder<Cursor, Atom, ChildCursor, ChildAtom>
    ) => void,
    body?: (
      builder: BlockBodyBuilder<Cursor, Atom, ChildCursor, ChildAtom>
    ) => void
  ): ForeignBlockBuilder<Cursor, Atom, ChildCursor, ChildAtom> | void {
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
