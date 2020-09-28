use std::sync::Arc;

use parking_lot::Mutex;

use crate::{outputs::PrimitiveOutput, timeline::Timeline};

#[test]
fn primitive_cell() {
    let mut timeline = Timeline::new();

    // initialize inputs
    let input = Arc::new(Mutex::new(timeline.cell(1)));

    // initialize outputs
    let mut output1 = PrimitiveOutput::cell(input.clone());
    let mut output2 = PrimitiveOutput::cell(input.clone());

    assert_eq!(output1.value(), &1);
    assert_eq!(output2.value(), &1);

    // edit
    timeline.update(&mut input.lock(), 2);

    // archive
    output1.update();
    output2.update();

    assert_eq!(output1.value(), &2);
    assert_eq!(output2.value(), &2);
}
