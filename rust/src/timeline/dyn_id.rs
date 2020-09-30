use std::{any::type_name, any::TypeId, fmt::Debug};

use crate::TypedInputId;

use super::id::{IdKind, InputId};

#[doc(hidden)]
#[derive(Debug, Copy, Clone)]
pub struct DynId {
    id: InputId,
    kind: IdKind,
    type_id: TypeId,
    type_name: &'static str,
}

impl DynId {
    pub(crate) fn new<T>(id: InputId, kind: IdKind) -> DynId
    where
        T: 'static,
    {
        DynId {
            id,
            kind,
            type_id: TypeId::of::<T>(),
            type_name: type_name::<T>(),
        }
    }

    #[doc(hidden)]
    pub fn downcast<T>(self) -> TypedInputId<T>
    where
        T: 'static,
    {
        if TypeId::of::<T>() == self.type_id {
            TypedInputId::new(self.id, self.kind)
        } else {
            panic!(
                "Can't downcast DynId of {} to {}",
                self.type_name,
                type_name::<T>()
            )
        }
    }
}
