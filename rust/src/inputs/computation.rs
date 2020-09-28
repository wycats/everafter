use std::{fmt::Debug, sync::Arc};

use derive_new::new;
use parking_lot::Mutex;

use crate::timeline::{Inputs, Revision};

use super::Tag;

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

#[derive(new)]
pub(crate) struct ReactiveComputation<T: Debug + Clone + 'static> {
    tag: ComputationTag,
    computation: Box<dyn Fn(&Inputs) -> T>,
}

impl<T: Debug + Clone + 'static> ReactiveComputation<T> {
    pub(crate) fn compute(&self, inputs: &Inputs) -> T {
        (self.computation)(inputs)
    }

    pub(crate) fn revision(&self) -> Revision {
        self.tag.revision()
    }
}

impl<T> Debug for ReactiveComputation<T>
where
    T: Debug + Clone + 'static,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ReactiveComputation<{:?}>", std::any::type_name::<T>())
    }
}
