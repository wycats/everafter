use std::{any::type_name, fmt::Debug};

use fxtypemap::TypeMap;
use indexmap::IndexMap;

use crate::{inputs::reactive::ReactiveCompute, TypedInputId};
use crate::{
    inputs::{Reactive, ReactiveCell, ReactiveDerived},
    Revision,
};

use super::{
    id::{CellId, DerivedId, IdKind, IdKindFor, InputId, TypedInputIdWithKind},
    EvaluationContext,
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

    fn get(&self, key: TypedInputIdWithKind<T, Id>) -> Option<&R> {
        self.map.get(&key.as_unchecked_id())
    }
}

#[derive(Debug)]
pub(crate) struct TypedInputs<T: Debug + Clone + 'static> {
    pub(super) cells: InternalTypedInputs<T, CellId<T>, ReactiveCell<T>>,
    pub(super) derived: InternalTypedInputs<T, DerivedId<T>, ReactiveDerived<T>>,
}

impl<T: Debug + Clone + 'static> TypedInputs<T> {
    // pub(crate) fn consume()

    pub(crate) fn for_type() -> TypedInputs<T> {
        TypedInputs::<T> {
            cells: InternalTypedInputs::new(CellId),
            derived: InternalTypedInputs::new(DerivedId),
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

    fn revision(&self, id: TypedInputId<T>) -> Option<Revision> {
        match id.kind() {
            IdKind::CellId => Some(
                self.cells
                    .get(id.downcast(CellId))
                    .expect("typed cell didn't exist")
                    .get_tag()
                    .revision(),
            ),
            IdKind::DerivedId => Some(
                self.derived
                    .get(id.downcast(DerivedId))
                    .expect("typed derived didn't exist")
                    .get_tag()
                    .revision(),
            ),
            IdKind::ListId => unimplemented!("TypedInputs::revision for list"),
        }
    }

    pub(crate) fn value(&self, id: TypedInputId<T>, ctx: &mut EvaluationContext) -> T {
        match id.kind() {
            IdKind::CellId => self.read_cell(id.downcast(CellId), ctx),
            IdKind::DerivedId => self.compute_derived(id.downcast(DerivedId), ctx),
            IdKind::ListId => unimplemented!("Inputs::get_value for lists"),
        }
    }

    fn read_cell(
        &self,
        id: TypedInputIdWithKind<T, CellId<T>>,
        stack: &mut EvaluationContext,
    ) -> T {
        let cell = self.cells.get(id).expect("typed cell didn't exist");
        stack.consume(cell.get_tag());
        cell.read()
    }

    fn compute_derived(
        &self,
        id: TypedInputIdWithKind<T, DerivedId<T>>,
        ctx: &mut EvaluationContext,
    ) -> T {
        let cell = self.derived.get(id).expect("typed derived didn't exist");
        let derived = cell.reset_tag();
        ctx.push(derived);
        let result = cell.compute(ctx);
        let tag = ctx.pop();
        ctx.consume(tag.into());
        result
    }

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
pub(crate) struct Inputs {
    map: TypeMap,
    types: Vec<String>,
}

impl Inputs {
    pub(crate) fn value<T>(&self, id: impl Into<TypedInputId<T>>, ctx: &mut EvaluationContext) -> T
    where
        T: Debug + Clone + 'static,
    {
        let id = id.into();

        match id.kind() {
            IdKind::CellId => self.map_for::<T>().read_cell(id.downcast(CellId), ctx),
            IdKind::DerivedId => self
                .map_for::<T>()
                .compute_derived(id.downcast(DerivedId), ctx),
            IdKind::ListId => unimplemented!("Inputs::get_value for lists"),
        }
    }

    pub(crate) fn revision<T>(&self, id: impl Into<TypedInputId<T>>) -> Option<Revision>
    where
        T: Debug + Clone + 'static,
    {
        let id = id.into();
        self.map_for::<T>().revision(id)
    }

    // fn split(&mut self) -> PartitionedInputs {
    //     PartitionedInputs {
    //         map: &mut self.map,
    //         types: &mut self.types,
    //     }
    // }

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

    fn map_for<T: Debug + Clone + 'static>(&self) -> &TypedInputs<T> {
        if self.map.contains::<TypedInputs<T>>() {
            self.map.get::<TypedInputs<T>>().unwrap()
        } else {
            panic!("Could not get map for {}", type_name::<T>());
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
