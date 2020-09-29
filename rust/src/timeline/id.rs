use std::{fmt::Debug, hash::Hash, marker::PhantomData};

use super::Inputs;

#[derive(Debug, Copy, Clone, Hash, Eq, PartialEq)]
pub struct InputId {
    id: u64,
}

impl InputId {
    pub(crate) fn first() -> InputId {
        InputId { id: 0 }
    }

    pub(crate) fn next(self) -> InputId {
        InputId { id: self.id + 1 }
    }

    pub(crate) fn typed<T, K>(self, kind: fn() -> K) -> TypedInputIdWithKind<T, K>
    where
        T: Clone + Debug + 'static,
        K: IdKindFor<T>,
    {
        TypedInputIdWithKind {
            id: self,
            marker: PhantomData,
            kind: kind(),
        }
    }
}

#[derive(Copy, Clone, Debug, Hash, Eq, PartialEq)]
pub enum IdKind {
    CellId,
    DerivedId,
    ListId,
    FunctionId,
}

pub trait IdKindFor<T>: Copy
where
    T: Debug + Clone + 'static,
{
    fn id_kind(self) -> IdKind;
    fn value(self, id: InputId, inputs: &Inputs) -> T;
}

macro_rules! id_kind {
    ($id:ident, | $input_id:ident, $map:ident | $definition:expr) => {
        id_kind!($id, |$input_id, $map, input| $definition);
    };

    ($id:ident, | $input_id:ident, $map:ident, $inputs:tt | $definition:expr) => {
        #[derive(Debug, Clone)]
        pub struct $id<T: Debug + Clone + 'static> {
            marker: PhantomData<T>,
        }

        impl<T> Copy for $id<T> where T: Debug + Clone + 'static {}

        #[allow(non_snake_case)]
        pub(crate) fn $id<T>() -> $id<T>
        where
            T: Debug + Clone + 'static,
        {
            $id {
                marker: PhantomData,
            }
        }

        impl<T> IdKindFor<T> for $id<T>
        where
            T: Clone + Debug + 'static,
        {
            fn id_kind(self) -> IdKind {
                IdKind::$id
            }

            fn value(self, id: InputId, $inputs: &Inputs) -> T {
                let $input_id = TypedInputIdWithKind {
                    id,
                    marker: self.marker,
                    kind: self,
                };
                let $map = $inputs.read_map_for::<T>();
                $definition
            }
        }
    };
}

id_kind!(CellId, |id, map| map.get_cell(id).read());
id_kind!(DerivedId, |id, map, inputs| map
    .get_derived(id)
    .compute(inputs));
// id_kind!(ListId, |id, inputs| {
//     let map = inputs.read_map_for::<T>();
//     let cell = map.get_list(id);
//     cell.read()
// });
id_kind!(FunctionId, |id, map, inputs| map
    .get_function(id)
    .call(inputs));

#[derive(Debug)]
pub struct TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    id: InputId,
    marker: PhantomData<T>,
    kind: K,
}

impl<T, K> TypedInputIdWithKind<T, K>
where
    T: Clone + Debug + 'static,
    K: IdKindFor<T>,
{
    pub fn value(self, inputs: &Inputs) -> T {
        TypedInputId::from(self).value(inputs)
    }
}

impl<T, K> From<TypedInputIdWithKind<T, K>> for TypedInputId<T>
where
    T: Clone + Debug + 'static,
    K: IdKindFor<T>,
{
    fn from(input: TypedInputIdWithKind<T, K>) -> TypedInputId<T> {
        TypedInputId {
            id: input.id,
            marker: input.marker,
            kind: input.kind.id_kind(),
        }
    }
}

impl<T, K> TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    pub(crate) fn new(id: InputId, kind: K) -> TypedInputIdWithKind<T, K> {
        TypedInputIdWithKind {
            id,
            marker: PhantomData,
            kind,
        }
    }
}

impl<T, K> TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    pub(crate) fn next(self) -> TypedInputIdWithKind<T, K> {
        TypedInputIdWithKind {
            id: self.id.next(),
            kind: self.kind,
            marker: PhantomData,
        }
    }
}

#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub struct TypedInputId<T> {
    id: InputId,
    marker: PhantomData<T>,
    kind: IdKind,
}

impl<T> Copy for TypedInputId<T> where T: Clone + Debug + 'static {}

impl<T: Clone + Debug + 'static> TypedInputId<T> {
    pub(crate) fn value(&self, inputs: &Inputs) -> T {
        match self.kind {
            IdKind::CellId => CellId {
                marker: self.marker,
            }
            .value(self.id, inputs),
            IdKind::DerivedId => DerivedId {
                marker: self.marker,
            }
            .value(self.id, inputs),
            IdKind::ListId => unimplemented!(),
            IdKind::FunctionId => FunctionId {
                marker: self.marker,
            }
            .value(self.id, inputs),
        }
    }
}

impl<T, K> Hash for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.kind.id_kind().hash(state);
        self.id.hash(state);
    }
}

impl<T, K> PartialEq for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl<T, K> Eq for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
}

impl<T, K> Copy for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
}

impl<T, K> Clone for TypedInputIdWithKind<T, K>
where
    K: IdKindFor<T>,
    T: Clone + Debug + 'static,
{
    fn clone(&self) -> Self {
        *self
    }
}
