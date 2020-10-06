use syn::{parse::Parse, ReturnType, Token, Type};

pub(super) struct MandatoryReturn {
    pub(super) arrow: Token![->],
    pub(super) ty: Box<Type>,
}

impl Parse for MandatoryReturn {
    fn parse(input: syn::parse::ParseStream) -> syn::Result<Self> {
        let ret: ReturnType = input.parse()?;

        match ret {
            ReturnType::Default => {
                return Err(syn::Error::new(
                    input.span(),
                    "everafter functions must have a return value",
                ))
            }
            ReturnType::Type(arrow, ty) => Ok(MandatoryReturn { arrow, ty }),
        }
    }
}
