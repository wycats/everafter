import type {
  CompilableAtom,
  ReactiveParameter,
  CompilerDelegate,
  AppenderForCursor,
  Host,
} from "everafter";
import { num, NumberArrayOps, NumberListOutput } from "./output";

export const ARRAY_COMPILER: CompilerDelegate<NumberArrayOps> = {
  appender(host: Host): AppenderForCursor<NumberArrayOps> {
    return cursor => new NumberListOutput(cursor, host);
  },

  intoAtom(atom: ReactiveParameter<number>): CompilableAtom<NumberArrayOps> {
    return num(atom);
  },
};
