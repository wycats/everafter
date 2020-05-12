import type { Operations, CursorRange } from "./ops";
import type { Updater } from "./update";
import type { Output } from "./output";

export type OutputFactory<Ops extends Operations> = (
  cursor: Ops["cursor"]
) => AbstractOutput<Ops>;

export abstract class AbstractOutput<Ops extends Operations> {
  abstract range<T>(callback: () => T): { value: T; range: CursorRange<Ops> };
  abstract getOutput(): OutputFactory<Ops>;
  abstract getCursor(): Ops["cursor"];

  abstract appendLeaf(leaf: Ops["leafKind"]): Updater;
  abstract openBlock<B extends Ops["blockKind"]>(
    open: B["open"]
  ): BlockBuffer<Ops, B>;
}

export type UserBlock<Ops extends Operations> = (output: Output<Ops>) => void;

export interface BlockBuffer<
  Ops extends Operations,
  Kind extends Ops["blockKind"]
> {
  head(head: Kind["head"]): void;
  flush(): void;
  close(): void;
}
