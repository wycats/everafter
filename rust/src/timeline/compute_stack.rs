use std::fmt::Debug;

use derive_new::new;

use crate::inputs::{computation::ComputationTag, Tag};

#[derive(Debug, Default, new)]
pub(crate) struct ComputeStack {
    #[new(default)]
    stack: Vec<ComputationTag>,
}

impl ComputeStack {
    pub(crate) fn consume(&self, tag: Tag) {
        if let Some(current) = self.stack.last() {
            current.consume(tag);
        }
    }
}
