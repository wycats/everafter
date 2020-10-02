use std::fmt::Debug;

use fxtypemap::TypeMap;
use indexmap::IndexMap;

use crate::inputs::reactive::ReactiveCompute;
use crate::{
    inputs::{Reactive, ReactiveCell, ReactiveDerived, ReactiveFunctionInstance},
    Revision,
};

use super::{
    id::{
        CellId, ComputeKindFor, DerivedId, FunctionId, IdKind, IdKindFor, InputId,
        TypedInputIdWithKind,
    },
    partition::PartitionedInputs,
    partition::PartitionedInternalInputs,
    partition::PartitionedTypedInputs,
    ComputeStack,
};

#[derive(Debug, Clone)]
pub(super) struct InternalTypedInputs<T, Id, R>
where
    T: Debug + Clone + 'static,
    Id: IdKindFor<T>,
    R: Reactive,
{
    pub(super) map: IndexMap<InputId, R>,
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

    pub(super) fn split(&mut self) -> PartitionedInternalInputs<T, R> {
        PartitionedInternalInputs::from_inputs(self)
    }

    fn next_id(&mut self) -> TypedInputIdWithKind<T, Id> {
        let next = self.next_id;
        self.next_id = next.next();
        next
    }

    fn insert(&mut self, value: R) -> TypedInputIdWithKind<T, Id> {
        let next = self.next_id();
        self.map.insert(next.as_unchecked_id(), value);
        next
    }

    fn get_mut(&mut self, key: TypedInputIdWithKind<T, Id>) -> Option<&mut R> {
        self.map.get_mut(&key.as_unchecked_id())
    }
}

#[derive(Debug)]
pub(crate) struct TypedInputs<T: Debug + Clone + 'static> {
    pub(super) stack: ComputeStack,

    pub(super) cells: InternalTypedInputs<T, CellId<T>, ReactiveCell<T>>,
    pub(super) derived: InternalTypedInputs<T, DerivedId<T>, ReactiveDerived<T>>,
    pub(super) functions: InternalTypedInputs<T, FunctionId<T>, ReactiveFunctionInstance<T>>,
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

    pub(super) fn split(&mut self) -> PartitionedTypedInputs<T> {
        PartitionedTypedInputs::from_inputs(self)
    }

    fn computing<'bucket, K, U>(
        &mut self,
        _bucket: &'bucket mut InternalTypedInputs<T, K, U>,
        _id: TypedInputIdWithKind<T, K>,
        _error: &'static str,
    ) -> &'bucket U
    where
        K: ComputeKindFor<T>,
        U: ReactiveCompute,
    {
        unimplemented!()
        // let cell = bucket.get_mut(id.into()).expect(error);
        // cell.reset_tag();
        // self.stack.push(cell.get_derived_tag());
        // self.stack.consume(cell);
        // cell
    }

    // fn get_cell(&self, id: TypedInputId<T>) -> &ReactiveCell<T> {
    //     let cell = self.cells.get(id).expect("typed cell didn't exist");
    //     self.stack.consume(cell);
    //     cell
    // }

    pub(crate) fn update_cell(
        &mut self,
        id: TypedInputIdWithKind<T, CellId<T>>,
        value: T,
        revision: Revision,
    ) {
        let cell = self
            .cells
            .get_mut(id.into())
            .expect("typed cell didn't exist");
        cell.update(value, revision);
    }
}

#[derive(Default)]
pub struct Inputs {
    map: TypeMap,
    types: Vec<String>,
}

impl Inputs {
    pub(crate) fn get_value<T>(&mut self, id: TypedInputIdWithKind<T, impl IdKindFor<T>>) -> T
    where
        T: Debug + Clone + 'static,
    {
        match id.kind() {
            IdKind::CellId => self
                .split()
                .partition_cell(id.into(), |_, cell| cell.read()),
            IdKind::DerivedId => unimplemented!(),
            IdKind::ListId => unimplemented!(),
            IdKind::FunctionId => unimplemented!(),
        }
    }

    pub(crate) fn get_revision<T>(
        &self,
        _id: TypedInputIdWithKind<T, impl IdKindFor<T>>,
    ) -> Option<Revision>
    where
        T: Debug + Clone + 'static,
    {
        unimplemented!();
    }

    fn split(&mut self) -> PartitionedInputs {
        PartitionedInputs {
            map: &mut self.map,
            types: &mut self.types,
        }
    }

    pub(crate) fn add_derived<T>(
        &mut self,
        derived: ReactiveDerived<T>,
    ) -> TypedInputIdWithKind<T, DerivedId<T>>
    where
        T: Debug + Clone + 'static,
    {
        self.map_for_mut::<T>().add_derived(derived)
    }

    pub(crate) fn add_cell<T>(
        &mut self,
        cell: ReactiveCell<T>,
    ) -> TypedInputIdWithKind<T, CellId<T>>
    where
        T: Debug + Clone + 'static,
    {
        self.map_for_mut::<T>().add_cell(cell)
    }

    pub(crate) fn add_function<T>(
        &mut self,
        function: ReactiveFunctionInstance<T>,
    ) -> TypedInputIdWithKind<T, FunctionId<T>>
    where
        T: Debug + Clone + 'static,
    {
        self.map_for_mut::<T>().add_function(function)
    }

    fn register_map<T: Debug + Clone + 'static>(&mut self) {
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

    fn map_for_mut<T: Debug + Clone + 'static>(&mut self) -> &mut TypedInputs<T> {
        if self.map.contains::<TypedInputs<T>>() {
            self.map.get_mut::<TypedInputs<T>>().unwrap()
        } else {
            self.register_map::<T>();
            self.map.get_mut::<TypedInputs<T>>().unwrap()
        }
    }

    pub(crate) fn update_cell<T>(
        &mut self,
        id: TypedInputIdWithKind<T, CellId<T>>,
        value: T,
        revision: Revision,
    ) where
        T: Debug + Clone + 'static,
    {
        self.map_for_mut::<T>().update_cell(id, value, revision);
    }
}

impl Debug for Inputs {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut debug = IndexMap::new();
        debug.insert("types", &self.types);
        write!(f, "{:?}", debug)
    }
}
