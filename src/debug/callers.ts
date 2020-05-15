import StackTracey, { StackTraceyFrame } from "stacktracey";
import type { Operations, UserBlock, UserBlockFunction } from "../interfaces";

/**
 * The number of frames to walk back to find the frame
 * of the code calling callerFrame.
 */
export const CURRENT = 1;

/**
 * The number of frames to walk back to find the direct caller
 * of the code calling callerFrame.
 *
 * You need to go back one frame to find the caller of callerFrame,
 * and one more to find the caller of that frame.
 */
export const PARENT = 2;

export function callerFrame(depth: number): StackTraceyFrame {
  let trace = new StackTracey();
  return trace.withSource(depth);
}

export function frameSource(frame: StackTraceyFrame): string {
  let file = frame.file;
  file = file.replace(/^webpack:\/\/\/(tests|src)/, "webpack:///./$1");
  return `${file}:${frame.line}:${frame.column}`;
}

export interface AnnotatedFunction<F extends Function> {
  f: F;
  source: StackTraceyFrame;
}

export function copyAnnotation<F extends Function>(
  original: AnnotatedFunction<Function>,
  target: F
): AnnotatedFunction<F> {
  return {
    f: target,
    source: original.source,
  };
}

function annotateWithFrame<F extends Function>(
  f: F,
  source: StackTraceyFrame
): AnnotatedFunction<F> {
  return {
    f,
    source,
  };
}

/**
 * A general-purpose function annotater. It attaches an annotation about the
 * caller's source location to the function.
 */
export function annotate<F extends Function>(
  f: F,
  caller = callerFrame(PARENT)
): AnnotatedFunction<F> {
  return annotateWithFrame(f, caller);
}

/**
 * Annotate a {@link UserBlockFunction}. The main reason this function exists
 * is to get better type feedback if you pass the wrong kind of function in.
 *
 * Otherwise, it's fine to use {@link annotate}.
 */
export function block<Ops extends Operations>(
  invoke: UserBlockFunction<Ops>,
  frame = callerFrame(PARENT)
): UserBlock<Ops> {
  return annotateWithFrame(invoke, frame);
}
