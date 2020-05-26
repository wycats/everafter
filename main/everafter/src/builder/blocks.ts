import { conditionBlock, invokeBlock, staticBlock } from "../block-primitives";
import type { AnnotatedFunction } from "../debug";
import type { Block, CompileOperations } from "../interfaces";
import { factory, Owner } from "../owner";
import type { Region } from "../region";
import type { Dict } from "../utils";
import type { Var } from "../value";
// eslint-disable-next-line import/no-cycle
import {
  Compilable,
  CompileCursorAdapter,
  Evaluate,
  ReactiveState,
  Statement,
  StaticBlockBuilder,
} from "./builder";
import type { ReactiveParameter } from "./param";

export interface CompilableBlock<Cursor, Atom> {
  intoBlock(state: ReactiveState): Block<Cursor, Atom>;
}

export class Conditional<Cursor, Atom> implements Compilable<Cursor, Atom> {
  #condition: ReactiveParameter<boolean>;
  #then: CompilableBlock<Cursor, Atom>;
  #else: CompilableBlock<Cursor, Atom>;

  constructor(
    condition: ReactiveParameter<boolean>,
    then: CompilableBlock<Cursor, Atom>,
    otherwise: CompilableBlock<Cursor, Atom>
  ) {
    this.#condition = condition;
    this.#then = then;
    this.#else = otherwise;
  }

  compile(state: ReactiveState): Evaluate<Cursor, Atom> {
    let condition = this.#condition.hydrate(state);
    let then = this.#then.intoBlock(state);
    let otherwise = this.#else.intoBlock(state);

    let func = (output: Region<Cursor, Atom>): void => {
      let cond = conditionBlock<Cursor, Atom>(condition, then, otherwise);

      output.renderBlock(cond);
    };

    return func;
  }
}

export type UserBuilderBlock<Cursor, Atom, DefaultAtom> = AnnotatedFunction<
  (builder: StaticBlockBuilder<Cursor, Atom, DefaultAtom>) => void
>;

export class CompilableStaticBlock<Cursor, Atom>
  implements CompilableBlock<Cursor, Atom>, Compilable<Cursor, Atom> {
  static from<Cursor, Atom, DefaultAtom>(
    owner: Owner,
    block: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    ops: CompileOperations<Cursor, Atom, DefaultAtom>
  ): CompilableBlock<Cursor, Atom> {
    let builder = owner.instantiate(factory(StaticBlockBuilder), ops);
    block(builder);
    return builder.done();
  }

  #statements: readonly Statement<Cursor, Atom>[];

  constructor(statements: readonly Statement<Cursor, Atom>[]) {
    this.#statements = statements;
  }

  compile(
    state: ReactiveState<Dict<Var<unknown>>>
  ): Evaluate<Cursor, Atom, void> {
    let block = this.intoBlock(state);

    return region => {
      invokeBlock(block, region);
    };
  }

  intoBlock(state: ReactiveState): Block<Cursor, Atom> {
    let statements = this.#statements.map(s => s.compile(state));

    return (region: Region<Cursor, Atom>): void => {
      for (let statement of statements) {
        statement(region);
      }
    };
  }
}

export class ForeignBlock<ParentCursor, ParentAtom, Cursor, Atom, DefaultAtom>
  implements
    CompilableBlock<ParentCursor, ParentAtom>,
    Compilable<ParentCursor, ParentAtom> {
  #head: CompilableBlock<Cursor, Atom>;
  #body: CompilableBlock<ParentCursor, ParentAtom>;
  #adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>;

  constructor(
    head: CompilableBlock<Cursor, Atom>,
    body: CompilableBlock<ParentCursor, ParentAtom>,
    adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>
  ) {
    this.#head = head;
    this.#body = body;
    this.#adapter = adapter;
  }

  compile(state: ReactiveState): Evaluate<ParentCursor, ParentAtom, void> {
    let block = this.intoBlock(state);

    return region => {
      invokeBlock(block, region);
    };
  }

  intoBlock(state: ReactiveState): Block<ParentCursor, ParentAtom> {
    let head = this.#head.intoBlock(state);
    let body = this.#body.intoBlock(state);

    return staticBlock((region: Region<ParentCursor, ParentAtom>): void => {
      let child = region.open(this.#adapter.runtime);

      invokeBlock(head, child);
      let grandchild = region.flush(this.#adapter.runtime, child);
      invokeBlock(body, grandchild);
    });
  }
}
