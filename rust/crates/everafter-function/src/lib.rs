#![feature(proc_macro_diagnostic)]
#![allow(dead_code)]

mod args;
mod ret;

use proc_macro::TokenStream;
use quote::quote;
use ret::MandatoryReturn;
use syn::{parse::Parse, parse::ParseStream, parse_macro_input, Block, Ident, Result};

use args::FunctionArgs;

struct Func {
    name: Ident,
    args: FunctionArgs,
    ret: MandatoryReturn,
    block: Block,
}

impl Parse for Func {
    fn parse(input: ParseStream) -> Result<Self> {
        // $id:ident
        let name: Ident = input.parse()?;

        // parse ($($arg:id: $ty:ty,)*) with optional trailing `,`
        let args: FunctionArgs = input.parse()?;

        // parse `-> $ret:ty`
        let ret: MandatoryReturn = input.parse()?;

        // parse $block:block
        let block: Block = input.parse()?;

        Ok(Func {
            name,
            args,
            ret,
            block,
        })
    }
}

#[proc_macro]
pub fn func(input: TokenStream) -> TokenStream {
    let Func {
        name,
        args: FunctionArgs { arg, ty },
        ret: MandatoryReturn { ty: ret, .. },
        block,
    } = parse_macro_input!(input as Func);

    let out = quote! {
        #[derive(Debug, Copy, Clone)]
        #[allow(non_camel_case_types)]
        struct #name {
            #(
                #arg: everafter::timeline::DynId,
            )*
        }

        impl everafter::inputs::DynamicComputation<#ret> for #name
        where
            #ret: std::fmt::Debug + Clone + 'static,
        {
            fn compute(&self, ctx: &mut everafter::timeline::EvaluationContext) -> #ret {
                #(
                    let #arg = ctx.value(self.#arg.downcast::<#ty>()).clone();
                )*

                #block
            }
        }

        fn #name(#( #arg: impl Into<everafter::timeline::TypedInputId<#ty>> ),*) -> #name
        where #ret: std::fmt::Debug + Clone + 'static,
        #(
            #ty: std::fmt::Debug + Clone + 'static,
        )*
        {
            #name {
                #(
                    #arg: {
                        let arg: everafter::timeline::TypedInputId<#ty> = #arg.into();
                        let ret: everafter::timeline::DynId = arg.into();
                        ret
                    },
                )*
            }
        }
    };

    out.into()
}
