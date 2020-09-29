use std::fmt::Debug;

use derive_new::new;

use crate::inputs::{DerivedTag, Reactive};

#[derive(Debug, Default, new)]
pub(crate) struct ComputeStack {
    #[new(default)]
    stack: Vec<DerivedTag>,
}

impl ComputeStack {
    pub(crate) fn consume(&self, input: &impl Reactive) {
        if let Some(current) = self.stack.last() {
            current.consume(input.get_tag());
        }
    }
}
