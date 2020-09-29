use std::sync::Arc;

use crate::timeline::Revision;

use super::{DerivedTag, Tag};

#[derive(Debug, Clone)]
pub(crate) enum ReactiveTag {
    Tag(Arc<Tag>),
    Derived(DerivedTag),
}

impl ReactiveTag {
    pub(crate) fn revision(&self) -> Revision {
        match self {
            ReactiveTag::Tag(tag) => tag.revision.get(),
            ReactiveTag::Derived(tag) => tag.revision(),
        }
    }
}

pub(crate) trait Reactive {
    fn get_tag(&self) -> ReactiveTag;
}
