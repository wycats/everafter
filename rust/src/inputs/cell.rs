use derive_new::new;
use std::fmt::Debug;

use crate::timeline::revision::{AtomicRevision, Revision};

#[derive(Debug, new)]
pub(crate) struct Tag {
    pub(crate) revision: AtomicRevision,
}

#[derive(Debug, new)]
pub(crate) struct ReactiveCell<T: Debug + Clone> {
    value: T,
    tag: Tag,
}

impl<T> ReactiveCell<T>
where
    T: Debug + Clone,
{
    pub(crate) fn read(&self) -> T {
        self.value.clone()
    }

    /**
     * Update must only be called outside of an archive step.
     */
    pub(crate) fn update(&mut self, value: T, revision: Revision) {
        self.value = value;
        self.tag.revision.update(revision);
    }

    pub(crate) fn revision(&self) -> Revision {
        self.tag.revision.get()
    }
}
