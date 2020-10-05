use std::{any::type_name, any::TypeId, fmt::Debug, marker::PhantomData};

use crate::timeline::{DynId, EvaluationContext, TypedInputId};

use super::{reactive::ReactiveCompute, DerivedTag, Reactive, ReactiveTag};

#[macro_export]
macro_rules! func {
    ($name:ident($arg:ident : $ty:ty) -> $ret:ty $block:block) => {
        fn code(
            ctx: &mut $crate::timeline::EvaluationContext,
            arg: $crate::timeline::DynId,
        ) -> $ret {
            let $arg = ctx.value(arg.downcast::<$ty>());
            $block
        }

        let $name = $crate::inputs::DynamicFunction::<$ret>::from_macro::<$ty>(code);
    };
}

#[doc(hidden)]
#[derive(Clone)]
pub struct DynamicFunction<T>
where
    T: Debug + Clone + 'static,
{
    arg_id: TypeId,
    arg_name: &'static str,
    code: fn(&mut EvaluationContext, DynId) -> T,
}

impl<T> Copy for DynamicFunction<T> where T: Clone + Debug + 'static {}

impl<T> DynamicFunction<T>
where
    T: Debug + Clone + 'static,
{
    #[doc(hidden)]
    pub fn from_macro<Arg>(code: fn(&mut EvaluationContext, arg: DynId) -> T) -> DynamicFunction<T>
    where
        Arg: Clone + Debug + 'static,
    {
        DynamicFunction {
            arg_id: TypeId::of::<Arg>(),
            arg_name: type_name::<Arg>(),
            code,
        }
    }

    fn call(self, ctx: &mut EvaluationContext, arg: DynId) -> T {
        (self.code)(ctx, arg)
    }
}

impl<T> Debug for DynamicFunction<T>
where
    T: Debug + Clone + 'static,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "function(&Inputs, {}) -> {}",
            self.arg_name,
            type_name::<T>()
        )
    }
}

#[derive(Copy, Clone)]
pub struct ReactiveFunction<T, Arg>
where
    T: Debug + Clone + 'static,
    Arg: Debug + Clone + 'static,
{
    code: DynamicFunction<T>,
    arg: PhantomData<Arg>,
}

impl<T, Arg> ReactiveFunction<T, Arg>
where
    T: Debug + Clone + 'static,
    Arg: Debug + Clone + 'static,
{
    pub(crate) fn new(code: DynamicFunction<T>) -> ReactiveFunction<T, Arg> {
        ReactiveFunction {
            code,
            arg: PhantomData,
        }
    }

    pub(crate) fn instantiate(self, args: TypedInputId<Arg>) -> ReactiveFunctionInstance<T> {
        ReactiveFunctionInstance {
            code: self.code,
            args: args.into(),
            tag: Some(DerivedTag::default()),
        }
    }
}

impl<T, Arg> std::fmt::Debug for ReactiveFunction<T, Arg>
where
    T: Debug + Clone + 'static,
    Arg: Debug + Clone + 'static,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "ReactiveFunction")
    }
}

#[derive(Debug, Clone)]
pub(crate) struct ReactiveFunctionInstance<T>
where
    T: Debug + Clone + 'static,
{
    args: DynId,
    code: DynamicFunction<T>,
    tag: Option<DerivedTag>,
}

impl<T> ReactiveFunctionInstance<T>
where
    T: Debug + Clone + 'static,
{
    pub(crate) fn call(&self, ctx: &mut EvaluationContext) -> T {
        (self.code).call(ctx, self.args)
    }
}

impl<T> Reactive for ReactiveFunctionInstance<T>
where
    T: Debug + Clone + 'static,
{
    fn get_tag(&self) -> super::ReactiveTag {
        ReactiveTag::Derived(self.get_derived_tag())
    }
}

impl<T> ReactiveCompute for ReactiveFunctionInstance<T>
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
