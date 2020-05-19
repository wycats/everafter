import { PARENT, caller } from "../debug/index";
import type { Host, Operations, AppenderForCursor } from "../interfaces";
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
import {
  CompilerDelegate,
  Program,
  ReactiveState,
  Evaluate,
  CompilableAtom,
  ProgramBlock,
} from "./builder";

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
  Ops extends Operations,
  Params extends ReactiveParameters = ReactiveParameters
> {
  static for<
    Ops extends Operations,
    I extends ReactiveInputs<Dict<ReactiveParameter>>
  >(
    inputs: I,
    host: Host,
    delegate: CompilerDelegate<Ops>
  ): Compiler<Ops, ReactiveParametersForInputs<I>> {
    let reactiveParams = ReactiveParameters.for(inputs);
    let appender = delegate.appender(host);
    return new Compiler(reactiveParams, appender, delegate, host) as Compiler<
      Ops,
      ReactiveParametersForInputs<I>
    >;
  }

  #params: Params;
  #appender: AppenderForCursor<Ops>;
  #delegate: CompilerDelegate<Ops>;
  #host: Host;

  constructor(
    params: Params,
    appender: AppenderForCursor<Ops>,
    delegate: CompilerDelegate<Ops>,
    host: Host
  ) {
    this.#params = params;
    this.#appender = appender;
    this.#delegate = delegate;
    this.#host = host;
  }

  get params(): Params {
    return this.#params;
  }

  compile(
    callback: (
      builder: Program<Ops>,
      callbackParams: ReactiveDict<Params>
    ) => void
  ): CompiledProgram<Ops, Params> {
    let block = (state: ReactiveState): Evaluate<Ops> => {
      let source = caller(PARENT);
      let builder = new Program<Ops>(this, source);
      callback(builder, this.#params.dict as ReactiveDict<Params>);
      return builder.compile(state);
    };

    return new CompiledProgram(block, this.#appender, this.#params, this.#host);
  }

  intoAtom<A extends Ops["atom"]>(
    atom: Ops["defaultAtom"]
  ): CompilableAtom<Ops, A> {
    return this.#delegate.intoAtom(atom);
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
  Ops extends Operations,
  Params extends ReactiveParameters
> {
  #block: ProgramBlock<Ops>;
  #appender: AppenderForCursor<Ops>;
  #params: Params;
  #host: Host;

  constructor(
    block: ProgramBlock<Ops>,
    appender: AppenderForCursor<Ops>,
    params: Params,
    host: Host
  ) {
    this.#block = block;
    this.#appender = appender;
    this.#params = params;
    this.#host = host;
  }

  render(
    dict: DynamicRuntimeValues<Params>,
    cursor: Ops["cursor"]
  ): RootBlock<Ops> {
    let evaluate = this.#block(this.#params.hydrate(dict));
    let block = new RootBlock<Ops>(evaluate, this.#appender, this.#host);
    block.render(cursor);
    return block;
  }
}
