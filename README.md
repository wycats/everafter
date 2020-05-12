This repository is a minimal implementation of the Glimmer VM reactivity system.

It uses `@glimmer/validator` for its input state.

Glimmer VM hardcodes `SimpleDOM` as its output state, and this repository is exploring a more general notion of output that would allow Glimmer's reactivity system to be used for general-purpose outputs.

# Inputs

Reactive Prototype distills down all reactive inputs into three concepts:

- `Cell`, which represents a single unit of atomic, reactive storage
- `Derived`, which represents a computation built on other reactive inputs
- `Const`, which represents a single atomic piece of storage that cannot change

## `Cell`

## `Derived`

## `Const`

# Output

Output data structures conceptually have two parts:

- a data structure that is exposed to the user and shouldn't be mutated
- a mutable tree of nodes that map onto the output data structure

## Lifecycle

The first time a reactive output is constructed, it creates the entire data structure that is exposed to the user. As it builds the output data structure, it creates nested updating steps that should be consulted whenever any of the inputs change.

Reactive Prototype is responsible for running those updating steps only when there is a chance that the part of the output that they correspond to has changes.

## Example: List of Numbers

Let's build a simple reactive output: a list of numbers.

```ts
export class NumberList
```
