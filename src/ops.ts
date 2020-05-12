export interface Cursor {}

export interface CursorRange<Ops extends Operations> {
  clear(): Ops["cursor"];
}

export interface BlockDetails {
  open: unknown;
  head: unknown;
}

export interface Operations {
  cursor: Cursor;
  leafKind: unknown;
  blockKind: BlockDetails;
}
