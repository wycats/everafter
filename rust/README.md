# TODO

## Reactive Data Structures:

- [x] Input: Cell
- [x] Input: Derived
- [x] Input: Functions
- [ ] Input: List
- [x] Output: Primitive
- [ ] Output: List (needed for DOM children)
- [ ] Output: Tree (needed for DOM nodes)
- [ ] Output: Map (needed for DOM attributes)
- [ ] Output: Set (needed for DOM class list)

## Correct Validation

- [x] Input: Cell
- [ ] Input: Derived
- [ ] Input: Functions
- [ ] Constants

## Functions

- [x] One argument
- [ ] Multiple arguments
- [ ] Currying
- [ ] Higher order functions

## Correctness

- [ ] GC unused input nodes

## Program Definition

This still needs a design, but the idea is that instead of manually updating each output node, there
would be a structure that described the entire program flow and Everafter would handle repeatedly
updating the relevant nodes, as well as GCing unused nodes.
