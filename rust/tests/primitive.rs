use everafter::timeline::{Inputs, Timeline};

#[test]
fn primitive_cell() {
    let mut timeline = Timeline::new();

    // initialize inputs
    let input = timeline.cell(1);

    // initialize outputs
    let mut output1 = timeline.output(input);
    let mut output2 = timeline.output(input);

    assert_eq!(output1.value(), &1);
    assert_eq!(output2.value(), &1);

    // edit
    timeline.update(input, 2);

    // archive
    timeline.update_output(&mut output1);
    timeline.update_output(&mut output2);

    assert_eq!(output1.value(), &2);
    assert_eq!(output2.value(), &2);
}

#[test]
fn primitive_derived() {
    let mut timeline = Timeline::new();

    let input1 = timeline.cell(1);
    let input2 = timeline.cell(2);

    let computation = move |inputs: &Inputs| -> i32 { input1.value(inputs) + input2.value(inputs) };
    let derived = timeline.derived(computation);

    // initialize outputs
    let mut output1 = timeline.output(derived);
    let mut output2 = timeline.output(derived);

    assert_eq!(output1.value(), &3);
    assert_eq!(output2.value(), &3);

    // edit
    timeline.update(input1, 5);
    timeline.update(input2, 10);

    // archive
    timeline.update_output(&mut output1);
    timeline.update_output(&mut output2);

    assert_eq!(output1.value(), &15);
    assert_eq!(output2.value(), &15);
}
