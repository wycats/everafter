use std::{fmt::Debug, sync::Arc};

use derive_new::new;
use parking_lot::Mutex;

use crate::timeline::{partition::PartitionedInputs, Revision};

use super::{reactive::ReactiveCompute, Reactive, ReactiveTag};

#[derive(Debug, Default, Clone)]
pub struct DerivedTag {
    deps: Arc<Mutex<Vec<ReactiveTag>>>,
}

impl DerivedTag {
    pub(crate) fn reset(self) -> Self {
        self.deps.lock().clear();
        self
    }

    pub(crate) fn revision(&self) -> Revision {
        let deps = self.deps.lock();

        deps.iter()
            .map(|d| d.revision())
            .max()
            .unwrap_or(Revision::constant())
    }

    pub(crate) fn consume(&self, tag: ReactiveTag) {
        let mut deps = self.deps.lock();
        deps.push(tag);
    }
}

#[derive(new)]
pub(crate) struct ReactiveDerived<T: Debug + Clone + 'static> {
    tag: Option<DerivedTag>,
    computation: Box<dyn Fn(PartitionedInputs<'_>) -> T>,
}

impl<T: Debug + Clone + 'static> ReactiveDerived<T> {
    pub(crate) fn compute(&self, inputs: PartitionedInputs<'_>) -> T {
        (self.computation)(inputs)
    }

    pub(crate) fn revision(&self) -> Revision {
        self.get_tag().revision()
    }
}

impl<T> Reactive for ReactiveDerived<T>
where
    T: Debug + Clone + 'static,
{
    fn get_tag(&self) -> ReactiveTag {
        ReactiveTag::Derived(self.get_derived_tag())
    }
}

impl<T> ReactiveCompute for ReactiveDerived<T>
where
    T: Debug + Clone + 'static,
{
    fn get_internal_tag(&self) -> &Option<DerivedTag> {
        &self.tag
    }

    fn get_internal_tag_mut(&mut self) -> &mut Option<DerivedTag> {
        &mut self.tag
    }
    // fn reset_tag(&mut self) -> DerivedTag {
    //     let tag = self.take_tag();
    //     tag.reset();
    //     tag
    // }

    // fn replace_tag(&mut self, tag: DerivedTag) {
    //     match self.tag {
    //         Some(tag) => panic!("Cannot replace a tag on ReactiveDerived; one already existed!"),
    //         None => {
    //             self.tag.replace(tag);
    //         }
    //     }
    // }

    // fn consume(&mut self, tag: ReactiveTag) {
    //     self.tag().consume(tag)
    // }

    // fn get_derived_tag(&self) -> DerivedTag {
    //     self.tag()
    // }
}

impl<T> Debug for ReactiveDerived<T>
where
    T: Debug + Clone + 'static,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ReactiveComputation<{:?}>", std::any::type_name::<T>())
    }
}
