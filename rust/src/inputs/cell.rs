use derive_new::new;
use std::{fmt::Debug, sync::Arc};

use crate::timeline::revision::{AtomicRevision, Revision};

use super::{Reactive, ReactiveTag};

#[derive(Debug)]
pub struct Tag {
    pub(crate) revision: AtomicRevision,
}

impl Tag {
    pub(crate) fn arc(revision: AtomicRevision) -> Arc<Tag> {
        Arc::new(Tag { revision })
    }
}

#[derive(Debug, new)]
pub(crate) struct ReactiveCell<T> {
    value: T,
    tag: Arc<Tag>,
}

impl<T> Reactive for ReactiveCell<T> {
    fn get_tag(&self) -> ReactiveTag {
        ReactiveTag::Tag(self.tag.clone())
    }
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
