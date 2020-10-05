use std::any::TypeId;

#[doc(hidden)]
pub struct MacroArg {
    type_id: TypeId,
    type_name: &'static str,
}

#[macro_export]
macro_rules! func {
    ($name:ident($($arg:ident : $ty:ty),*) -> $ret:ty $block:block) => {
        #[derive(Debug, Copy, Clone)]
        struct Computation {
            $(
                $arg: $crate::timeline::DynId,
            )*
        }

        impl $crate::inputs::DynamicComputation<$ret> for Computation
        where
            $ret: std::fmt::Debug + Clone + 'static,
        {
            fn compute(&self, ctx: &mut $crate::timeline::EvaluationContext) -> $ret {
                $(
                    let $arg = ctx.value(self.$arg.downcast::<$ty>()).clone();
                )*

                $block
            }
        }

        fn $name($( $arg: impl Into<$crate::timeline::TypedInputId<$ty>> ),*) -> Computation
        where
        $(
            $ty: std::fmt::Debug + Clone + 'static,
        )*
        {
            // let arg: $crate::timeline::TypedInputId<$ty> = arg.into();

            Computation {
                $(
                    $arg: {
                        let arg: $crate::timeline::TypedInputId<$ty> = $arg.into();
                        arg.into()
                    },
                )*
            }
        }
    };
}
