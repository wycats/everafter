use std::fmt::Debug;

use crate::{
    inputs::{computation::ComputationTag, ReactiveCell, ReactiveComputation, ReactiveInput, Tag},
    outputs::PrimitiveOutput,
};

use super::{inputs::TypedCellId, inputs::TypedDerivedId, ComputeStack, Inputs, Revision};
use derive_new::new;
use thread_local::ThreadLocal;

#[derive(Debug, new)]
pub(crate) struct Timeline {
    #[new(value = "Revision::start()")]
    revision: Revision,
    #[new(default)]
    stack: ThreadLocal<ComputeStack>,
    #[new(default)]
    inputs: Inputs,
}

impl Timeline {
    pub(crate) fn register_map<T: Debug + Clone + 'static>(&mut self) {
        self.inputs.register_map::<T>()
    }

    pub(crate) fn cell<T: Debug + Clone + 'static>(&mut self, value: T) -> TypedCellId<T> {
        let cell = ReactiveCell::new(value, Tag::new(self.revision.atomic()));
        let map = self.inputs.map_for_mut::<T>();
        map.add_cell(cell)
    }

    pub(crate) fn derived<T: Debug + Clone + 'static>(
        &mut self,
        computation: impl Fn(&Inputs) -> T + 'static,
    ) -> TypedDerivedId<T> {
        let derived = ReactiveComputation::new(ComputationTag::default(), Box::new(computation));
        let map = self.inputs.map_for_mut::<T>();
        map.add_derived(derived)
    }

    pub(crate) fn output_from_cell<T: Debug + Clone + 'static>(
        &self,
        id: TypedCellId<T>,
    ) -> PrimitiveOutput<T> {
        let map = self.inputs.map_for::<T>();
        let cell = map.get_cell(id);
        let value = cell.read();

        PrimitiveOutput::new(value, ReactiveInput::Cell(id))
    }

    pub(crate) fn get_derived<T: Debug + Clone + 'static>(
        &self,
        id: TypedCellId<T>,
    ) -> &ReactiveCell<T> {
        let map = self.inputs.map_for::<T>();
        map.get_cell(id)
    }

    pub(crate) fn output_from_derived<T: Debug + Clone + 'static>(
        &self,
        id: TypedDerivedId<T>,
    ) -> PrimitiveOutput<T> {
        let map = self.inputs.map_for::<T>();
        let derived = map.get_derived(id);
        let value = derived.compute(&self.inputs);

        PrimitiveOutput::new(value, ReactiveInput::Derived(id))
    }

    pub(crate) fn update_output<T: Debug + Clone + 'static>(
        &mut self,
        output: &mut PrimitiveOutput<T>,
    ) {
        output.update(&mut self.inputs)
    }

    pub(crate) fn consume(&self, cell: &ReactiveCell<impl Debug + Clone>) {
        let stack = self.stack.get_or_default();
    }

    pub(crate) fn update<T: Debug + Clone + 'static>(&mut self, id: TypedCellId<T>, value: T) {
        self.revision = self.revision.increment();
        let map = self.inputs.map_for_mut::<T>();
        let cell = map.get_cell_mut(id);
        cell.update(value, self.revision);
    }
}
