EverAfter is a reactivity library that glues together reactive inputs with a notion of reactive outputs.

It uses `@glimmer/tracking` for its reactive inputs and defines a new notion of reactive output that this README will explore.

# Discrete Reactivity

EverAfter's reactivity model is _discrete_, which means that all of the inputs into the system are applies to the output of the system periodically. We call

This means that if a reactive input changes multiple times
