import { PARENT, caller, sourceFrame } from "../debug/index";
import type { CompileOperations, AppendingReactiveRange } from "../interfaces";
import type { Dict } from "../utils";
import {
  ReactiveParameter,
  ReactiveParameters,
  ReactiveDict,
  ReactiveInputs,
  ReactiveParametersForInputs,
  DynamicRuntimeValues,
} from "./param";
import { RootBlock } from "../root";
import { Program, ReactiveState, Evaluate, ProgramBlock } from "./builder";
import { Owner, Owned, getOwner } from "../owner";

/**
 * A {@link Compiler} knows about its reactive parameters, and can compile
 * programs that use those reactive parameters.
 *
 * One useful property of the {@link Compiler} class is that it makes the
 * program passed into {@link Compiler#compile} type safe. If you attempt
 * to use parameters in the program that don't exist, you'll get a type error.
 * If you attempt to pass something other than a ReactiveParameter<boolean>
 * as the condition to `if`, you'll get a type error.
 *
 * JavaScript-only users don't need to worry about this detail, of course.
 */
export class Compiler<
  Cursor,
  Atom,
  DefaultAtom,
  Params extends ReactiveParameters = ReactiveParameters
> extends Owned {
  static for<
    Cursor,
    Atom,
    DefaultAtom,
    I extends ReactiveInputs<Dict<ReactiveParameter>>
  >(
    owner: Owner,
    inputs: I,
    operations: CompileOperations<Cursor, Atom, DefaultAtom>
  ): Compiler<Cursor, Atom, DefaultAtom, ReactiveParametersForInputs<I>> {
    let reactiveParams = ReactiveParameters.for(inputs);
    return new Compiler(owner, reactiveParams, operations) as Compiler<
      Cursor,
      Atom,
      DefaultAtom,
      ReactiveParametersForInputs<I>
    >;
  }

  #params: Params;
  #operations: CompileOperations<Cursor, Atom, DefaultAtom>;

  constructor(
    owner: Owner,
    params: Params,
    operations: CompileOperations<Cursor, Atom, DefaultAtom>
  ) {
    super(owner);
    this.#params = params;
    this.#operations = operations;
  }

  get params(): Params {
    return this.#params;
  }

  compile(
    callback: (
      builder: Program<Cursor, Atom, DefaultAtom>,
      callbackParams: ReactiveDict<Params>
    ) => void
  ): CompiledProgram<Cursor, Atom, Params> {
    let block = (state: ReactiveState): Evaluate<Cursor, Atom> => {
      let builder = this.new(Program, this.#operations);
      callback(builder, this.#params.dict as ReactiveDict<Params>);
      return builder.compile(state);
    };

    return getOwner(this).instantiate(
      owner => new CompiledProgram(owner, block, this.#params)
    );
  }
}

/**
 * A {@link CompiledProgram} is the result of combining together:
 *
 * 1. reactive parameters
 * 2. an implementation of a reactive region
 * 3. a reactive program that reads from the reactive parameters and operates
 *  on the reactive region.
 *
 * A {@link CompiledProgram} is evaluated at runtime by providing the concrete
 * reactive values and a concrete cursor for the reactive region.
 */
export class CompiledProgram<
  Cursor,
  Atom,
  Params extends ReactiveParameters
> extends Owned {
  #block: ProgramBlock<Cursor, Atom>;
  #params: Params;

  constructor(owner: Owner, block: ProgramBlock<Cursor, Atom>, params: Params) {
    super(owner);
    this.#block = block;
    this.#params = params;
  }

  render(
    dict: DynamicRuntimeValues<Params>,
    cursor: AppendingReactiveRange<Cursor, Atom>
  ): RootBlock<Cursor, Atom> {
    let evaluate = this.#block(this.#params.hydrate(dict));
    let block = getOwner(this).instantiate(
      owner => new RootBlock(owner, evaluate)
    );
    block.render(cursor);
    return block;
  }
}
