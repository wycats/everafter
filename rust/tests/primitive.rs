use everafter::timeline::PartitionedInputs;

mod common;
use common::Test;

#[test]
fn primitive_cell() {
    let mut test = Test::new();

    // initialize inputs
    let mut input = test.cell("input", 1);

    // initialize outputs
    let mut output1 = input.output("output1", &mut test);
    let mut output2 = input.output("output2", &mut test);

    output1.expect(1, "initial value");
    output2.expect(1, "initial value");
    test.assert_unchanged(&input);

    // edit
    input.update(&mut test, 2);

    test.assert_changed(&mut input);

    // archive
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);

    output1.expect(2, "updated value");
    output2.expect(2, "updated value");

    test.assert_unchanged(&input);
}

#[test]
fn primitive_derived() {
    let mut test = Test::new();

    let mut input1 = test.cell("input1", 1);
    let mut input2 = test.cell("input2", 2);

    // derived computations work with Copy data, but test inputs are refs because they track last
    // revisions.
    let i1 = input1.handle();
    let i2 = input2.handle();

    let mut derived = test.derived("derived", move |mut inputs: PartitionedInputs<'_>| -> i32 {
        inputs.value(i1) + inputs.value(i2)
    });

    test.assert_changed(&mut derived);

    // initialize outputs
    let mut output1 = derived.output("output1", &mut test);
    let mut output2 = derived.output("output2", &mut test);

    output1.expect(3, "initial value");
    output2.expect(3, "initial value");

    test.assert_unchanged(&mut derived);

    // edit
    input1.update(&mut test, 5);
    input2.update(&mut test, 10);

    test.assert_changed(&mut derived);

    // archive
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);

    output1.expect(15, "after update");
    output2.expect(15, "after update");
}
