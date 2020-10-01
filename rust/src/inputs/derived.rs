use std::{fmt::Debug, sync::Arc};

use derive_new::new;
use parking_lot::Mutex;

use crate::timeline::{Inputs, Revision};

use super::{Reactive, ReactiveTag};

#[derive(Debug, Default, Clone)]
pub struct DerivedTag {
    deps: Arc<Mutex<Vec<ReactiveTag>>>,
}

impl DerivedTag {
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
    tag: DerivedTag,
    computation: Box<dyn Fn(&Inputs) -> T>,
}

impl<T: Debug + Clone + 'static> ReactiveDerived<T> {
    pub(crate) fn compute(&self, inputs: &Inputs) -> T {
        (self.computation)(inputs)
    }

    pub(crate) fn revision(&self) -> Revision {
        self.tag.revision()
    }
}

impl<T: Debug + Clone + 'static> Reactive for ReactiveDerived<T> {
    fn get_tag(&self) -> ReactiveTag {
        ReactiveTag::Derived(self.tag.clone())
    }
}

impl<T> Debug for ReactiveDerived<T>
where
    T: Debug + Clone + 'static,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ReactiveComputation<{:?}>", std::any::type_name::<T>())
    }
}
