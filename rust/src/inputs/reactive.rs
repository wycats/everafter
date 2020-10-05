use std::sync::Arc;

use crate::timeline::Revision;

use super::{DerivedTag, Tag};

#[derive(Debug, Clone)]
pub enum ReactiveTag {
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

pub trait Reactive {
    fn get_tag(&self) -> ReactiveTag;
}

// pub(crate) trait ReactiveCompute: Reactive + Sized {
//     // fn get_derived_tag(&self) -> DerivedTag;
//     // fn reset_tag(&mut self) -> DerivedTag;
//     // fn replace_tag(&mut self, tag: DerivedTag);
//     // fn consume(&mut self, tag: ReactiveTag);

//     fn get_internal_tag(&self) -> &Option<DerivedTag>;
//     fn get_internal_tag_mut(&mut self) -> &mut Option<DerivedTag>;

//     fn reset_tag<T>(&self, cb: impl FnOnce(DerivedTag) -> T) -> T {
//         let tag = tag_for(self);
//         tag.reset();
//         let result = cb(tag.clone());
//         tag.done();
//         result
//     }

//     fn replace_tag(&mut self, tag: DerivedTag) {
//         if let None = self.get_internal_tag() {
//             panic!("Cannot replace a tag on ReactiveDerived; one already existed!")
//         }

//         self.get_internal_tag_mut().replace(tag);
//     }

//     fn add_dep(&mut self, tag: ReactiveTag) {
//         tag_for(self).add_dep(tag)
//     }

//     fn get_derived_tag(&self) -> DerivedTag {
//         tag_for(self)
//     }
// }

// fn tag_for(compute: &impl ReactiveCompute) -> DerivedTag {
//     match compute.get_internal_tag() {
//         None => panic!("Cannot compute a derived value while already computing it"),
//         Some(tag) => tag.clone(),
//     }
// }
