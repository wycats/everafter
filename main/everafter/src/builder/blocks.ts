import type { Host, CompileOperations, Block } from "../interfaces";
// eslint-disable-next-line import/no-cycle
import {
  Compilable,
  ReactiveState,
  Evaluate,
  StaticBlockBuilder,
  Statement,
  CompileCursorAdapter,
} from "./builder";
import type { ReactiveParameter } from "./param";
import { Source, annotate, AnnotatedFunction, getSource } from "../debug";
import { invokeBlock, conditionBlock, staticBlock } from "../block-primitives";
import type { Region } from "../region";
import type { Dict } from "../utils";
import type { Var } from "../value";

export interface CompilableBlock<Cursor, Atom> {
  intoBlock(state: ReactiveState): Block<Cursor, Atom>;
}

export class Conditional<Cursor, Atom> implements Compilable<Cursor, Atom> {
  #condition: ReactiveParameter<boolean>;
  #then: CompilableBlock<Cursor, Atom>;
  #else: CompilableBlock<Cursor, Atom>;
  #source: Source;

  constructor(
    condition: ReactiveParameter<boolean>,
    then: CompilableBlock<Cursor, Atom>,
    otherwise: CompilableBlock<Cursor, Atom>,
    location: Source
  ) {
    this.#condition = condition;
    this.#then = then;
    this.#else = otherwise;
    this.#source = location;
  }

  compile(state: ReactiveState): Evaluate<Cursor, Atom> {
    let condition = this.#condition.hydrate(state);
    let then = this.#then.intoBlock(state);
    let otherwise = this.#else.intoBlock(state);

    let func = (output: Region<Cursor, Atom>): void => {
      let cond = conditionBlock<Cursor, Atom>(
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

export type UserBuilderBlock<Cursor, Atom, DefaultAtom> = AnnotatedFunction<
  (builder: StaticBlockBuilder<Cursor, Atom, DefaultAtom>) => void
>;

export class CompilableStaticBlock<Cursor, Atom>
  implements CompilableBlock<Cursor, Atom>, Compilable<Cursor, Atom> {
  static from<Cursor, Atom, DefaultAtom>(
    block: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    ops: CompileOperations<Cursor, Atom, DefaultAtom>
  ): CompilableBlock<Cursor, Atom> {
    let builder = new StaticBlockBuilder(getSource(block), ops);
    block(builder);
    return builder.done();
  }

  #statements: readonly Statement<Cursor, Atom>[];
  #source: Source;

  constructor(statements: readonly Statement<Cursor, Atom>[], source: Source) {
    this.#statements = statements;
    this.#source = source;
  }

  compile(
    state: ReactiveState<Dict<Var<unknown>>>
  ): Evaluate<Cursor, Atom, void> {
    let block = this.intoBlock(state);

    return annotate((region, host) => {
      invokeBlock(block, region, host);
    }, this.#source);
  }

  intoBlock(state: ReactiveState): Block<Cursor, Atom> {
    let statements = this.#statements.map(s => s.compile(state));

    return staticBlock((output: Region<Cursor, Atom>, host: Host): void => {
      for (let statement of statements) {
        statement(output, host);
      }
    }, this.#source);
  }
}

export class ForeignBlock<ParentCursor, ParentAtom, Cursor, Atom, DefaultAtom>
  implements
    CompilableBlock<ParentCursor, ParentAtom>,
    Compilable<ParentCursor, ParentAtom> {
  #head: CompilableBlock<Cursor, Atom>;
  #body: CompilableBlock<ParentCursor, ParentAtom>;
  #adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>;
  #source: Source;

  constructor(
    head: CompilableBlock<Cursor, Atom>,
    body: CompilableBlock<ParentCursor, ParentAtom>,
    adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>,
    source: Source
  ) {
    this.#head = head;
    this.#body = body;
    this.#adapter = adapter;
    this.#source = source;
  }

  compile(state: ReactiveState): Evaluate<ParentCursor, ParentAtom, void> {
    let block = this.intoBlock(state);

    return annotate((region, host) => {
      invokeBlock(block, region, host);
    }, this.#source);
  }

  intoBlock(state: ReactiveState): Block<ParentCursor, ParentAtom> {
    let head = this.#head.intoBlock(state);
    let body = this.#body.intoBlock(state);

    return staticBlock(
      (region: Region<ParentCursor, ParentAtom>, host: Host): void => {
        let child = region.open(this.#adapter.runtime);

        invokeBlock(head, child, host);
        let grandchild = region.flush(this.#adapter.runtime, child);
        invokeBlock(body, grandchild, host);
      },
      this.#source
    );
  }
}
