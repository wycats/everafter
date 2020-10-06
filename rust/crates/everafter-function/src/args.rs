use syn::{
    parenthesized, parse::Parse, parse::ParseStream, punctuated::Punctuated, spanned::Spanned,
    FnArg, Pat, Result, Token, Type,
};

/**
 * FunctionArgs do not allow `self`, and converts the arguments into a form that is more usable in
 * macro expansions.
 */
pub(super) struct FunctionArgs {
    pub(super) arg: Vec<Box<Pat>>,
    pub(super) ty: Vec<Box<Type>>,
}

impl Parse for FunctionArgs {
    fn parse(input: ParseStream) -> Result<Self> {
        // parse (...)
        let content;
        let _ = parenthesized!(content in input);

        // the content of the (...) is a `,` delimited list of function arguments
        let args: Punctuated<FnArg, Token![,]> = content.parse_terminated(FnArg::parse)?;

        let mut arg_vec = vec![];
        let mut ty_vec = vec![];

        for arg in args.into_iter() {
            match arg {
                FnArg::Receiver(self_arg) => {
                    return Err(syn::Error::new(
                        self_arg.span(),
                        "everafter functions cannot take self as an argument",
                    ))
                }
                FnArg::Typed(arg) => {
                    arg_vec.push(arg.pat);
                    ty_vec.push(arg.ty)
                }
            }
        }

        Ok(FunctionArgs {
            arg: arg_vec,
            ty: ty_vec,
        })
    }
}
