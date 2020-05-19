import { PARENT, caller } from "../debug/index";
import type { Host, Operations } from "../interfaces";
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
  Params extends ReactiveParameters = ReactiveParameters
> {
  static for<Cursor, Atom, I extends ReactiveInputs<Dict<ReactiveParameter>>>(
    inputs: I,
    host: Host,
    operations: Operations<Cursor, Atom, unknown>
  ): Compiler<Cursor, Atom, ReactiveParametersForInputs<I>> {
    let reactiveParams = ReactiveParameters.for(inputs);
    return new Compiler(reactiveParams, operations, host) as Compiler<
      Cursor,
      Atom,
      ReactiveParametersForInputs<I>
    >;
  }

  #params: Params;
  #operations: Operations<Cursor, Atom>;
  #host: Host;

  constructor(
    params: Params,
    operations: Operations<Cursor, Atom>,
    host: Host
  ) {
    this.#params = params;
    this.#operations = operations;
    this.#host = host;
  }

  get params(): Params {
    return this.#params;
  }

  compile(
    callback: (
      builder: Program<Cursor, Atom>,
      callbackParams: ReactiveDict<Params>
    ) => void
  ): CompiledProgram<Cursor, Atom, Params> {
    let block = (state: ReactiveState): Evaluate<Cursor, Atom> => {
      let source = caller(PARENT);
      let builder = new Program<Cursor, Atom>(source);
      callback(builder, this.#params.dict as ReactiveDict<Params>);
      return builder.compile(state);
    };

    return new CompiledProgram(
      block,
      this.#operations,
      this.#params,
      this.#host
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
export class CompiledProgram<Cursor, Atom, Params extends ReactiveParameters> {
  #block: ProgramBlock<Cursor, Atom>;
  #operations: Operations<Cursor, Atom>;
  #params: Params;
  #host: Host;

  constructor(
    block: ProgramBlock<Cursor, Atom>,
    operations: Operations<Cursor, Atom>,
    params: Params,
    host: Host
  ) {
    this.#block = block;
    this.#operations = operations;
    this.#params = params;
    this.#host = host;
  }

  render(
    dict: DynamicRuntimeValues<Params>,
    cursor: Cursor
  ): RootBlock<Cursor, Atom> {
    let evaluate = this.#block(this.#params.hydrate(dict));
    let block = new RootBlock(evaluate, this.#operations, this.#host);
    block.render(cursor);
    return block;
  }
}
