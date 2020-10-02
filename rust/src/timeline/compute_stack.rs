use std::fmt::Debug;

use derive_new::new;

use crate::inputs::{DerivedTag, Reactive};

#[derive(Debug, Default, new)]
pub(crate) struct ComputeStack {
    #[new(default)]
    stack: Vec<DerivedTag>,
}

impl ComputeStack {
    pub(crate) fn push(&mut self, tag: DerivedTag) {
        self.stack.push(tag);
    }

    pub(crate) fn pop(&mut self) {
        self.stack.pop();
    }

    pub(crate) fn consume(&self, input: &impl Reactive) {
        if let Some(current) = self.stack.last() {
            current.consume(input.get_tag());
        }
    }
}
