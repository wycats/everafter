use std::fmt::Debug;

use crate::inputs::{ReactiveCell, Tag};

use super::{ComputeStack, Revision};
use derive_new::new;
use thread_local::ThreadLocal;

#[derive(Debug, new)]
pub(crate) struct Timeline {
    #[new(value = "Revision::start()")]
    revision: Revision,
    #[new(default)]
    stack: ThreadLocal<ComputeStack>,
}

impl Timeline {
    pub(crate) fn cell<T: Debug + Clone>(&self, value: T) -> ReactiveCell<T> {
        ReactiveCell::new(value, Tag::new(self.revision.atomic()))
    }

    pub(crate) fn consume(&self, cell: &ReactiveCell<impl Debug + Clone>) {
        let stack = self.stack.get_or_default();
    }

    pub(crate) fn update<T: Debug + Clone>(&mut self, cell: &mut ReactiveCell<T>, value: T) {
        self.revision = self.revision.increment();
        cell.update(value, self.revision);
    }
}
