use std::fmt::Debug;

use crate::timeline::{Inputs, TypedInputId};

use super::{DerivedTag, Reactive, ReactiveTag};

#[derive(Clone)]
pub struct ReactiveFunction<T>
where
    T: Debug + Clone + 'static,
{
    code: fn(&Inputs, TypedInputId<T>) -> T,
}

impl<T> std::fmt::Debug for ReactiveFunction<T>
where
    T: Debug + Clone + 'static,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ReactiveFunction")
    }
}

impl<T> Into<ReactiveFunction<T>> for fn(&Inputs, TypedInputId<T>) -> T
where
    T: Debug + Clone + 'static,
{
    fn into(self) -> ReactiveFunction<T> {
        ReactiveFunction { code: self }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct ReactiveFunctionInstance<T>
where
    T: Debug + Clone + 'static,
{
    args: TypedInputId<T>,
    function: ReactiveFunction<T>,
    tag: DerivedTag,
}

impl<T> ReactiveFunctionInstance<T>
where
    T: Debug + Clone + 'static,
{
    pub(crate) fn call(&self, inputs: &Inputs) -> T {
        (self.function.code)(inputs, self.args)
    }
}

impl<T> Reactive for ReactiveFunctionInstance<T>
where
    T: Debug + Clone + 'static,
{
    fn get_tag(&self) -> super::ReactiveTag {
        ReactiveTag::Derived(self.tag.clone())
    }
}
