import { conditionBlock, invokeBlock, staticBlock } from "../block-primitives";
import type { Block, CompileOperations } from "../interfaces";
import { Owner, Owned, getOwner } from "../owner";
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
import {
  setDefaultSource,
  getSource,
  maybeGetSource,
  sourceFrame,
  LogLevel,
  isDebuggable,
  printStructured,
  description,
  Structured,
  DEBUG,
} from "../debug";

export interface CompilableBlock<Cursor, Atom> extends Owned {
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
      sourceFrame(() => {
        let cond = conditionBlock<Cursor, Atom>(condition, then, otherwise);
        output.renderBlock(cond);
      }, getSource(this));
    };

    setDefaultSource(func, getSource(this));

    return func;
  }
}

export type UserBuilderBlock<Cursor, Atom, DefaultAtom> = (
  builder: StaticBlockBuilder<Cursor, Atom, DefaultAtom>
) => void;

export class CompilableStaticBlock<Cursor, Atom> extends Owned
  implements CompilableBlock<Cursor, Atom>, Compilable<Cursor, Atom> {
  static from<Cursor, Atom, DefaultAtom>(
    owner: Owner,
    block: UserBuilderBlock<Cursor, Atom, DefaultAtom>,
    ops: CompileOperations<Cursor, Atom, DefaultAtom>
  ): CompilableBlock<Cursor, Atom> {
    let builder = owner.new(StaticBlockBuilder, ops);
    block(builder);
    let compiled = builder.done();
    setDefaultSource(compiled, getSource(block));
    return compiled;
  }

  #statements: readonly Statement<Cursor, Atom>[];

  constructor(owner: Owner, statements: readonly Statement<Cursor, Atom>[]) {
    super(owner);
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
    let statements = this.#statements.map((s: Statement<Cursor, Atom>) => {
      let compiled = s.compile(state);
      let source = maybeGetSource(s);
      let debug = isDebuggable(s) ? printStructured(s, true) : undefined;

      setDefaultSource(compiled, source);

      if (source && debug) {
        return [compiled, source.describe(debug)] as const;
      } else if (source) {
        return [compiled, source[DEBUG]()] as const;
      } else if (isDebuggable(s)) {
        return [compiled, s[DEBUG]()] as const;
      } else {
        return [compiled, undefined] as const;
      }
    });

    return (region: Region<Cursor, Atom>): void => {
      for (let [statement, debug] of statements) {
        sourceFrame(() => {
          getOwner(region).host.context(LogLevel.Info, debug, () =>
            statement(region)
          );
        }, maybeGetSource(statement) || null);
      }
    };
  }
}

export class ForeignBlock<ParentCursor, ParentAtom, Cursor, Atom, DefaultAtom>
  extends Owned
  implements
    CompilableBlock<ParentCursor, ParentAtom>,
    Compilable<ParentCursor, ParentAtom> {
  #head: CompilableBlock<Cursor, Atom>;
  #body: CompilableBlock<ParentCursor, ParentAtom>;
  #adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>;

  constructor(
    owner: Owner,
    head: CompilableBlock<Cursor, Atom>,
    body: CompilableBlock<ParentCursor, ParentAtom>,
    adapter: CompileCursorAdapter<Cursor, Atom, DefaultAtom>
  ) {
    super(owner);
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
