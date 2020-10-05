use std::{fmt::Debug, sync::Arc};

use derive_new::new;
use parking_lot::{Mutex, MutexGuard};

use crate::{timeline::EvaluationContext, timeline::Revision};

use super::{Reactive, ReactiveTag};

#[derive(Debug, Default, Clone)]
pub struct DerivedTagData {
    deps: Vec<ReactiveTag>,
    initialized: bool,
    modifying: bool,
}

impl DerivedTagData {
    pub(crate) fn reset(&mut self) {
        self.deps.clear();
        self.modifying = true;
    }

    pub(crate) fn done(&mut self) {
        self.modifying = false;
    }

    pub(crate) fn revision(&self) -> Revision {
        self.deps
            .iter()
            .map(|d| d.revision())
            .max()
            .unwrap_or(Revision::constant())
    }

    pub(crate) fn add_dep(&mut self, tag: ReactiveTag) {
        self.deps.push(tag);
    }
}

#[derive(Debug, Clone, Default)]
pub struct DerivedTag {
    tag: Arc<Mutex<DerivedTagData>>,
}

impl DerivedTag {
    fn assert_not_modifying(&self, operation: &'static str) -> MutexGuard<DerivedTagData> {
        let tag = self.tag.lock();

        if tag.modifying {
            panic!("Cannot {} while a derived tag is being modified", operation);
        }

        tag
    }

    fn assert_modifying(&self, operation: &'static str) -> MutexGuard<DerivedTagData> {
        let tag = self.tag.lock();

        if !tag.modifying {
            panic!(
                "Cannot {} while a derived tag is not being modified",
                operation
            );
        }

        tag
    }

    pub(crate) fn reset(&self) {
        self.assert_not_modifying("reset").reset();
    }

    pub(crate) fn done(&self) {
        self.assert_modifying("finish modifying").done();
    }

    pub(crate) fn revision(&self) -> Revision {
        self.assert_not_modifying("get the revision").revision()
    }

    pub(crate) fn add_dep(&self, tag: ReactiveTag) {
        self.assert_modifying("add a dependency").add_dep(tag);
    }
}

impl Into<ReactiveTag> for DerivedTag {
    fn into(self) -> ReactiveTag {
        ReactiveTag::Derived(self)
    }
}

pub trait DynamicComputation<T>
where
    T: Debug + Clone + 'static,
{
    fn compute(&self, ctx: &mut EvaluationContext) -> T;
}

impl<T, U> DynamicComputation<T> for U
where
    U: Fn(&mut EvaluationContext) -> T,
    T: Debug + Clone + 'static,
{
    fn compute(&self, ctx: &mut EvaluationContext) -> T {
        self(ctx)
    }
}

#[derive(new)]
pub(crate) struct ReactiveDerived<T: Debug + Clone + 'static> {
    tag: DerivedTag,
    computation: Box<dyn DynamicComputation<T>>,
}

impl<T: Debug + Clone + 'static> ReactiveDerived<T> {
    pub(crate) fn compute(&self, ctx: &mut EvaluationContext) -> T {
        self.computation.compute(ctx)
    }

    pub(crate) fn revision(&self) -> Revision {
        self.get_tag().revision()
    }

    pub(crate) fn reset_tag<U>(&self, cb: impl FnOnce(DerivedTag) -> U) -> U {
        let tag = self.tag.clone();

        tag.reset();
        let result = cb(tag.clone());
        tag.done();
        result
    }
}

impl<T> Reactive for ReactiveDerived<T>
where
    T: Debug + Clone + 'static,
{
    fn get_tag(&self) -> ReactiveTag {
        ReactiveTag::Derived(self.tag.clone())
    }
}

// impl<T> ReactiveCompute for ReactiveDerived<T>
// where
//     T: Debug + Clone + 'static,
// {
//     fn get_internal_tag(&self) -> &Option<DerivedTag> {
//         &self.tag
//     }

//     fn get_internal_tag_mut(&mut self) -> &mut Option<DerivedTag> {
//         &mut self.tag
//     }
// }

impl<T> Debug for ReactiveDerived<T>
where
    T: Debug + Clone + 'static,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ReactiveComputation<{:?}>", std::any::type_name::<T>())
    }
}
