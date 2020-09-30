use std::fmt::Debug;

use fxtypemap::TypeMap;
use indexmap::IndexMap;

use crate::inputs::{Reactive, ReactiveCell, ReactiveDerived, ReactiveFunctionInstance};
use crate::timeline::TypedInputId;

use super::{
    id::{CellId, DerivedId, FunctionId, IdKindFor, InputId, TypedInputIdWithKind},
    ComputeStack,
};

#[derive(Debug)]
pub(crate) struct InternalTypedInputs<T, Id, R>
where
    T: Debug + Clone + 'static,
    Id: IdKindFor<T>,
    R: Reactive,
{
    map: IndexMap<TypedInputIdWithKind<T, Id>, R>,
    next_id: TypedInputIdWithKind<T, Id>,
}

impl<T, Id, R> InternalTypedInputs<T, Id, R>
where
    T: Debug + Clone + 'static,
    Id: IdKindFor<T>,
    R: Reactive,
{
    fn new(id: fn() -> Id) -> InternalTypedInputs<T, Id, R> {
        InternalTypedInputs {
            map: IndexMap::new(),
            next_id: InputId::first().typed(id),
        }
    }

    fn next_id(&mut self) -> TypedInputIdWithKind<T, Id> {
        let next = self.next_id;
        self.next_id = next.next();
        next
    }

    fn get(&self, id: TypedInputIdWithKind<T, Id>) -> Option<&R> {
        self.map.get(&id)
    }

    fn get_mut(&mut self, id: TypedInputIdWithKind<T, Id>) -> Option<&mut R> {
        self.map.get_mut(&id)
    }

    fn insert(&mut self, value: R) -> TypedInputIdWithKind<T, Id> {
        let next = self.next_id();
        self.map.insert(next, value);
        next
    }
}

#[derive(Debug)]
pub(crate) struct TypedInputs<T: Debug + Clone + 'static> {
    stack: ComputeStack,

    cells: InternalTypedInputs<T, CellId<T>, ReactiveCell<T>>,
    derived: InternalTypedInputs<T, DerivedId<T>, ReactiveDerived<T>>,
    functions: InternalTypedInputs<T, FunctionId<T>, ReactiveFunctionInstance<T>>,
}

impl<T: Debug + Clone + 'static> TypedInputs<T> {
    // pub(crate) fn consume()

    pub(crate) fn for_type() -> TypedInputs<T> {
        TypedInputs::<T> {
            stack: ComputeStack::default(),
            cells: InternalTypedInputs::new(CellId),
            derived: InternalTypedInputs::new(DerivedId),
            functions: InternalTypedInputs::new(FunctionId),
        }
    }

    pub(crate) fn add_cell(
        &mut self,
        value: ReactiveCell<T>,
    ) -> TypedInputIdWithKind<T, CellId<T>> {
        self.cells.insert(value)
    }

    pub(crate) fn add_derived(
        &mut self,
        value: ReactiveDerived<T>,
    ) -> TypedInputIdWithKind<T, DerivedId<T>> {
        self.derived.insert(value)
    }

    pub(crate) fn add_function(
        &mut self,
        value: ReactiveFunctionInstance<T>,
    ) -> TypedInputIdWithKind<T, FunctionId<T>> {
        self.functions.insert(value)
    }

    pub(crate) fn consuming<'bucket, K, U>(
        &self,
        bucket: &'bucket InternalTypedInputs<T, K, U>,
        id: TypedInputIdWithKind<T, K>,
        error: &'static str,
    ) -> &'bucket U
    where
        K: IdKindFor<T>,
        U: Reactive,
    {
        let cell = bucket.get(id).expect(error);
        self.stack.consume(cell);
        cell
    }

    pub(crate) fn get_cell(&self, id: TypedInputIdWithKind<T, CellId<T>>) -> &ReactiveCell<T> {
        self.consuming(&self.cells, id, "typed cell didn't exist")
    }

    pub(crate) fn get_derived(
        &self,
        id: TypedInputIdWithKind<T, DerivedId<T>>,
    ) -> &ReactiveDerived<T> {
        self.consuming(&self.derived, id, "typed derive didn't exist")
    }

    pub(crate) fn get_function(
        &self,
        id: TypedInputIdWithKind<T, FunctionId<T>>,
    ) -> &ReactiveFunctionInstance<T> {
        self.consuming(&self.functions, id, "typed function didn't exist")
    }

    pub(crate) fn get_cell_mut(
        &mut self,
        id: TypedInputIdWithKind<T, CellId<T>>,
    ) -> &mut ReactiveCell<T> {
        self.cells.get_mut(id).expect("typed cell didn't exist")
    }

    pub(crate) fn get_derived_mut(
        &mut self,
        id: TypedInputIdWithKind<T, DerivedId<T>>,
    ) -> &mut ReactiveDerived<T> {
        self.derived.get_mut(id).expect("typed cell didn't exist")
    }
}

#[derive(Default)]
pub struct Inputs {
    map: TypeMap,
    types: Vec<String>,
}

impl Inputs {
    pub fn value<T: Debug + Clone + 'static>(&self, id: impl Into<TypedInputId<T>>) -> T {
        let id = id.into();
        id.value(self)
    }

    pub(crate) fn read_cell<T: Debug + Clone + 'static>(
        &self,
        id: TypedInputIdWithKind<T, CellId<T>>,
    ) -> T {
        let map = self.read_map_for::<T>();
        map.get_cell(id).read()
    }

    pub(crate) fn compute_derived<T: Debug + Clone + 'static>(
        &self,
        id: TypedInputIdWithKind<T, DerivedId<T>>,
    ) -> T {
        let map = self.read_map_for::<T>();
        map.get_derived(id).compute(self)
    }

    // pub(crate) fn read_list<T: Debug + Clone + 'static>(&self) -> &TypedInputs<T> {
    //     if self.map.contains::<TypedInputs<T>>() {
    //         self.map.get::<TypedInputs<T>>().unwrap()
    //     } else {
    //         panic!(
    //             "Attempted to get map for {:?} but it wasn't registered",
    //             std::any::type_name::<T>()
    //         )
    //     }
    // }

    pub(crate) fn register_map<T: Debug + Clone + 'static>(&mut self) {
        let type_name = std::any::type_name::<T>();

        if self.map.contains::<TypedInputs<T>>() {
            panic!(
                "Attempted to register a map for {:?} but it was already registered",
                std::any::type_name::<T>()
            );
        } else {
            self.map.insert::<TypedInputs<T>>(TypedInputs::for_type());
            self.types.push(type_name.to_string());
        }
    }

    pub(crate) fn read_map_for<T: Debug + Clone + 'static>(&self) -> &TypedInputs<T> {
        if self.map.contains::<TypedInputs<T>>() {
            self.map.get::<TypedInputs<T>>().unwrap()
        } else {
            panic!(
                "Attempted to get map for {:?} but it wasn't registered",
                std::any::type_name::<T>()
            )
        }
    }

    pub(crate) fn map_for_mut<T: Debug + Clone + 'static>(&mut self) -> &mut TypedInputs<T> {
        if self.map.contains::<TypedInputs<T>>() {
            self.map.get_mut::<TypedInputs<T>>().unwrap()
        } else {
            self.register_map::<T>();
            self.map.get_mut::<TypedInputs<T>>().unwrap()
        }
    }
}

impl Debug for Inputs {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut debug = IndexMap::new();
        debug.insert("types", &self.types);
        write!(f, "{:?}", debug)
    }
}
