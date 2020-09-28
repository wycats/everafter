use atomig::Atomic;
use parking_lot::Mutex;
use std::{fmt::Debug, sync::Arc};

use crate::timeline::{revision::AtomicRevision, Revision};

use super::Tag;

trait Computation<T: Debug>: Debug {
    fn compute(&self) -> T;
}

#[derive(Debug, Default)]
pub(crate) struct ComputationTag {
    deps: Arc<Mutex<Vec<Tag>>>,
}

impl ComputationTag {
    pub(crate) fn revision(&self) -> Revision {
        let deps = self.deps.lock();

        deps.iter()
            .map(|d| &d.revision)
            .max()
            .map(|r| r.get())
            .unwrap_or(Revision::constant())
    }

    pub(crate) fn consume(&self, tag: Tag) {
        let mut deps = self.deps.lock();
        deps.push(tag);
    }
}

#[derive(Debug)]
pub(crate) struct ReactiveComputation<T: Debug> {
    tag: ComputationTag,
    computation: Box<dyn Computation<T>>,
}

impl<T: Debug> ReactiveComputation<T> {
    pub(crate) fn read(&self) -> T {
        self.computation.compute()
    }

    pub(crate) fn revision(&self) -> Revision {
        self.tag.revision()
    }
}
