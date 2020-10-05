use std::{fmt::Debug, sync::Arc};

use derive_new::new;
use parking_lot::Mutex;

use crate::{timeline::EvaluationContext, timeline::Revision};

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
    tag: Option<DerivedTag>,
    computation: Box<dyn DynamicComputation<T>>,
}

impl<T: Debug + Clone + 'static> ReactiveDerived<T> {
    pub(crate) fn compute(&self, ctx: &mut EvaluationContext) -> T {
        self.computation.compute(ctx)
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
}

impl<T> Debug for ReactiveDerived<T>
where
    T: Debug + Clone + 'static,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ReactiveComputation<{:?}>", std::any::type_name::<T>())
    }
}
