# The Reactive Timeline

Each mutation in EverAfter reactivity takes place on a unique point on the _reactive timeline_.

Changes to reactive inputs are periodically applied to the reactive output. Each point on the
reactive timeline after which the output was updated is called a _transaction checkpoint_.

# The Input Data Model

## Reactive Cell

The underlying unit of reactivity in EverAfter is the _reactive cell_, which represents a single
unit of atomic storage.

A _reactive cell_ has three fundamental operations:

- `read()`: Read the current value of this cell.
- `update(value)`: Update the value of this cell.
- `revision`: The point on the _reactive timeline_ when this cell was last updated.

When a reactive cell is _updated_, the _reactive timeline_'s timestamp is incremented, and the
cells' _revision_ is updated to the current timestamp.

When a reactive cell <math><mi mathvariant="monospace">C</mi></math> is _consumed_, the _current
reactive computation_ acquires a dependency on <math><mi mathvariant="monospace">C</mi></math>.

## Reactive External Storage

## Reactive Computation

A _reactive computation_ is a computation that reads from reactive cells either by reading their
values directly or by reading the values of another reactive computation.

A _reactive computation_ has two fundamental operations:

- `read()`: Compute the value of the computation.
- `revision`: The point on the reactive timeline after which all of this reactive computation's
  dependencies were up to date.

When a reactive computation <math><mi mathvariant="monospace">C</mi></math> is _consumed_, any
existing reactive computation acquires a dependency on <math><mi
mathvariant="monospace">C</mi></math>.

## Memoized Reactive Computation

A _memoized reactive computation_ is a _reactive computation_ that returns the last known value of
the computation as long as its _revision_ has not changed.

A _memoized reactive computation_ has only a single fundamental operation:

- `read()`:
  1. if this is the first `read()` or if the `revision` of the underlying computation has changed,
     compute and memoize the value of the computation.
  2. return the memoized value of the computation.

> A _memoized reactive computation_ is not a fundamental concept in EverAfter reactivity. However,
> it is so common that it's worth thinking of as a core part of the working model.

## Constant Values

A reactive cell may be _constant_. A _constant reactive cell_ must not change for the remainder of
the program, and therefore need not be validated for the remainder of the program.

A reactive computation is _constant_ if all of its most recent dependencies are _constant_.

# The Output Data Model

## Reactive Output Node

A _reactive output node_ is one of:

1. A _reactive tree node_
2. A _reactive primitive_
3. A _reactive list_
4. A _reactive map_
5. A _reactive set_

## Reactive Tree Node

A _reactive tree node_ has _reactive tree children_, each of which is:

1. A _reactive tree node_
2. A _reactive tree leaf_

### Reactive Tree Leaf

A _reactive tree leaf_ is one of:

1. A _reactive primitive_
2. A _reactive list_
3. A _reactive map_
4. A _reactive set_

## Reactive Primitive

A _reactive primitive_ is one of:

1. A _reactive cell_
2. A _reactive computation_
3. A _reactive memoized computation_

## Reactive List

A _reactive list_ is a list of items (each of which is a _reactive tree leaf_ identified by a
_key_).

## Key

A _key_ is a non-reactive, uniquely identifiable value for each entry in a list.

# Reflecting Inputs onto Outputs

The purpose of EverAfter reactivity is to turn reactive inputs into reactive outputs.
