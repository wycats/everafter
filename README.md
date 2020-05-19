# EverAfter

> Note: This README is based on the concepts currently implemented in this repository, but the APIs are currently slightly aspirational. Before publication, I intend to update the internals to reflect the design in the README.

A reactive system is a collection of reactive inputs and an output that makes structured demands on those inputs.

# Inputs

There are three kinds of inputs.

- `Cell`, which represents a single unit of atomic, reactive storage
- `Derived`, which represents a computation built on other reactive inputs
- `Const`, which represents a single atomic piece of storage that cannot change

All of the inputs to a reactive system are called the system's "arguments".

# Outputs

An output data structure makes structured demands on the system's arguments.

At a high level, an output can make the following structured demands:

1. `atom`, which takes an input and inserts it "as-is" into the output
2. `if`, which takes a reactive boolean as a condition and two blocks as outputs, and chooses which block to evaluate based upon the current value of the condition
3. `each`, which takes a reactive iterable and a block as an input and evaluates the block once for each iteration of the iterable
4. `invoke`, which takes a block and reactive inputs as arguments, and evaluates the block with the arguments

There is also one value-based structured demand:

1. `call`, which takes a function and reactive inputs as arguments, and produces a new reactive input

The purpose of these constructs is to make it possible to create highly expressive reactive programs with human-understandable constraints that we call "static data flow".

> Roughly speaking, static data flow means that we can express arbitrary programs, but still know, ahead of time, what shapes of the output data structure are possible. It is in contrast with dynamic data flow, which requires us to execute the program each time in order to learn the shape of the output data structure.

We'll get into the details of static data flow later, but first, let's take a look at what this all means in practice.

# Atomic Demand

The most basic kind of demand an output data structure can make on the system's arguments is an "atomic demand". This turns a single input into a single output.

A reactive system can use many kinds of data structures as its output.

Let's start with a whirlwind tour of the concept of a "demand" on a reactive system. We'll use a simple list of numbers to illustrate the concepts.

```ts
// define the arguments to the reactive system
const ARGS = args({
  number: Arg<number>(),
});

// define the output of the reactive system
const program = Program(ARGS, (p, { number }) => {
  p.atom(number);
});

// SYSTEM //

// create a single cell of storage
const number = Cell(10);

// create an output data structure to write into
const output = [];

// define a cursor into the output list
const cursor = { output, start: 0 };

// initialize the system by assigning each of its arguments to a reactive
// input, and supplying it with a cursor to write into
const system = program.initialize({ number }, cursor);

output; // [10]

number.current = 20;

// update the system
system.update();

output; // [20]
```

## Arguments

```ts
const ARGS = args({
  number: Arg<number>(),
});
```

This is saying that the system has a single argument named `number`, and its TypeScript type is `number`.

> Note: The whole system works without TypeScript, but these examples will use TypeScript for clarity.

## Program

```ts
const program = Program(ARGS, (p, { number }) => {
  b.atom(number);
});
```

This creates a new program that takes the `number` argument and inserts it into the output. Whenever the `number` argument changes, the output will reflect the new value.

Like a normal program, this program is generic: it can be used with any concrete arguments and any output data structure.

## System

The concrete arguments and output data structure are called a "system".

A system has:

1. a reactive input for each argument to the program
2. an output data structure
3. a cursor into the data structure

### The System

```ts
const number = Cell(10);
```

Create a single cell of storage, and initialize its value to `10`.

```ts
const output = [];
```

Create an output list to write into.

```ts
const cursor = { output, start: 0 };
```

Create a cursor that corresponds to the starting position of the array.

### Initializing the System

```ts
const system = program.initialize({ number }, cursor);
```

Initialize the system by giving it a reactive input for each argument, and giving it a cursor to write into.

After initializing the system, the output is up to date.

```json
[10]
```

### Updating the System

We update the system by changing the value of any input and calling `system.update()`.

```ts
number.current = 20;
system.update();
```

After updating the system, the output is up to date.

```json
[20]
```

# Structured Demand: Call

Earlier, we said that a reactive system makes _structured_ demands on its arguments.

So far, we've looked at a system making atomic demands on its arguments and inserting them into a flat output structure.

For this example, we'll introduce a simple kind of structured demand on the data: a "call".

```ts
// define the arguments to the reactive system
const ARGS = args({
  first: Arg<number>(),
  second: Arg<number>(),
});

// a function that takes two reactive variables and returns their sum
const sum = (first, second) => first.current + second.current;

// define the output of the reactive system
const program = Program(ARGS, (p, { first, second }) => {
  p.atom(first);
  p.atom(second);

  // insert the result of calling `sum` with `first` and `second`
  p.atom(p.call(sum, first, second));
});

// SYSTEM //

// create our storage cells
const first = Cell(10);
const second = Cell(20);

// create an output data structure to write into
const output = [];

// define a cursor into the output list
const cursor = { output, start: 0 };

// initialize the system by assigning each of its arguments to a reactive
// input, and supplying it with a cursor to write into
const system = program.initialize({ first, second }, cursor);

output; // [10, 20, 30]

second.current = 25;

// update the system
system.update();

output; // [10, 25, 35]

first.current = -10;

output; // [-10, 25, 15]
```

Not much has changed from the previous example, except that we can now call functions in our program with reactive arguments, and use the result as a new eractive argument that we pass to `atom`.

# Structured Demand: Conditional

So far, all of our structured demands took input values and inserted a single value into the output. To make our programs really useful, we need conditionals! Conditionals allow us to take a different action depending on the runtime value of a reactive boolean.

> Note: While conditionals allow your program to take different steps depending on the input, they still limit the affected part of the output to two possible shapes.

```ts
// define the arguments to the reactive system
const ARGS = args({
  first: Arg<number>(),
  second: Arg<number>(),
  third: Arg<number>(),
  showSum: Arg<boolean>(),
});

const sum = (first, second) => first.current + second.current;

// define the output of the reactive system
const program = Program(ARGS, (p, { first, second, third, showSum }) => {
  p.atom(first);
  p.atom(second);
  p.atom(third);

  p.if(showSum, () => p.call(sum, first, second));
});

// SYSTEM //

// create our storage cells
const first = Cell(5);
const second = Cell(10);
const showSum = Cell(true);
const third = Cell(100);

// create an output data structure to write into
const output = [];

// define a cursor into the output list
const cursor = { output, start: 0 };

// initialize the system by assigning each of its arguments to a reactive
// input, and supplying it with a cursor to write into
const system = program.initialize({ first, second, showSum, third }, cursor);

output; // [5, 10, 15, 100]

second.current = 20;

// update the system
system.update();

output; // [5, 20, 25, 100]

showSum.current = false;
system.update();

output; // [5, 20, 100]

first.current = -5;
showSum.current = true;
system.update();

output; // [-5, 20, 15, 100]
```

### The Conditional

```
p.if(showSum, () => p.atom(p.call(sum, first, second)));
```

This is saying that if the current value of `showSum` is true, call the `sum` function with the `first` and `second` reactive variables, and insert it into the output as an atom.

### Aside: Complex Conditions

What we've said so far implies that we could use `call` to create a condition for `if`, and indeed that's true.

<details>
  <summary>A detailed example</summary>

```ts
// define the arguments to the reactive system
const ARGS = args({
  first: Arg<number>(),
  second: Arg<number>(),
  third: Arg<number>(),
  showSum: Arg<boolean>(),
});

const sum = (first, second, third) =>
  first.current + second.current + third.current;

// true if both `first` and `second` are bigger than 0
const allPositive = (first: Var<number>, second: Var<number>): Var<boolean> =>
  first.current > 0 && second.current > 0;

// true if both first and second are true
const and = (first: Var<boolean>, second: Var<boolean>) =>
  first.current && second.current;

// define the output of the reactive system
const program = Program(ARGS, (p, { first, second, third, showSum }) => {
  p.atom(first);
  p.atom(second);
  p.atom(third);

  p.if(and(showSum, allPositive(first, second)), () =>
    p.call(sum, first, second)
  );
});

// SYSTEM //

// create our storage cells
const first = Cell(5);
const second = Cell(10);
const showSum = Cell(true);
const third = Cell(100);

// create an output data structure to write into
const output = [];

// define a cursor into the output list
const cursor = { output, start: 0 };

// initialize the system by assigning each of its arguments to a reactive
// input, and supplying it with a cursor to write into
const system = program.initialize({ first, second, showSum, third }, cursor);

output; // [5, 10, 15, 100]

second.current = 20;

// update the system
system.update();

output; // [5, 20, 25, 100]

showSum.current = false;
system.update();

output; // [5, 20, 100]

first.current = -5;
showSum.current = true;
system.update();

output; // [-5, 20, 100]

first.current = 5;
system.update();

output; // [5, 20, 25, 100]
```

> Note: Despite the fact that `first` and `second` are used in both the condition and the consequent, there is no bidirectional data flow here. The condition is computed from the values of the system's arguments, and nothing that happens in the consequent can change the decision made by the condition.

</details>

To illustrate that the same concepts would also apply to other data structures, let's run through a second example, this time writing into an HTML DOM.

In the array example above, our output data structure was a simple flat list. In the case of the DOM, we have flat lists of nodes, but we also have nested data structures.

So far, the blocks we've seen (`invoke` and `if`) did not appear at all in the output data structure. Now, we'll introduce a new kind of EverAfter block: a nested structure that does appear in the output.

```ts
// define the arguments to the reactive system
const ARGS = args({
  hello: Arg<string>(),
  world: Arg<string>(),
  title: Arg<string>(),
});

// define the output of the reactive system
const program = Program(ARGS, (p, { hello, world, title }) => {
  p.open(p.const("div"), el => {
    el.head("title", title)
  }, [
    p.atom(text(hello));
    p.atom(text(p.const(" ")));
    p.atom(text(world));
  ]);
});

// RUNTIME //

// create the storage
const hello = Cell("hello");
const world = Cell("world");
const title = Cell("EverAfter Demo");

// create an output data structure to write into, in this case a DOM element
const output = document.createElement("div");

// define a cursor into the output DOM
const cursor = { parentNode: output, nextSibling: null };

// initialize the system by assigning each of its arguments to a reactive
// input, and supplying it with a cursor to write into
const system = program.initialize({ hello, world, title }, cursor);

output; // <div title="EverAfter Demo">hello world</div>

hello.current = "HELLO";
system.update();

output; // <div title="EverAfter Demo">HELLO world</div>

title.current = "ever ever after";
system.update();

output; // <div title="ever ever after">HELLO world</div>
```

# Optimizations
