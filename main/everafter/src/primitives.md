In Reactive Prototype, all higher-level features are built up from primitives, which creates a very expressive system that behaves like a programming language, but also makes data flow static.

The core "reactive calculus" has four primitives:

1. Atomic values
2. Call
3. Conditional
4. Iteration

Unlike Glimmer VM, the core block calculus does not allow a block to directly invoke another block at runtime on the basis of runtime information. Instead, using the core block primitives, you can build up arbitrarily expressive blocks. The consequence is that it's possible to fully understand the data flow of a reactive program without executing it.

# What is static data flow?
