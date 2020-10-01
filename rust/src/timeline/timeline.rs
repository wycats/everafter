use std::fmt::Debug;

use derive_new::new;

use crate::{
    inputs::{
        function::DynamicFunction, function::ReactiveFunction, DerivedTag, ReactiveCell,
        ReactiveDerived, Tag,
    },
    outputs::PrimitiveOutput,
};

use super::{CellId, DerivedId, FunctionId, Inputs, Revision, TypedInputId, TypedInputIdWithKind};

#[derive(Debug, new)]
pub struct Timeline {
    #[new(value = "Revision::start()")]
    revision: Revision,
    #[new(default)]
    inputs: Inputs,
}

impl Default for Timeline {
    fn default() -> Timeline {
        Timeline::new()
    }
}

impl<'a> Into<&'a Inputs> for &'a Timeline {
    fn into(self) -> &'a Inputs {
        self.inputs()
    }
}

impl Timeline {
    pub fn cell<T: Debug + Clone + 'static>(
        &mut self,
        value: T,
    ) -> TypedInputIdWithKind<T, CellId<T>> {
        let cell = ReactiveCell::new(value, Tag::arc(self.revision.atomic()));
        let map = self.inputs.map_for_mut::<T>();
        map.add_cell(cell)
    }

    pub fn derived<T: Debug + Clone + 'static>(
        &mut self,
        computation: impl Fn(&Inputs) -> T + 'static,
    ) -> TypedInputIdWithKind<T, DerivedId<T>> {
        let derived = ReactiveDerived::new(DerivedTag::default(), Box::new(computation));
        let map = self.inputs.map_for_mut::<T>();
        map.add_derived(derived)
    }

    pub fn function<T: Debug + Clone + 'static, U: Debug + Clone + 'static>(
        &mut self,
        func: DynamicFunction<T>,
        arg: impl Into<TypedInputId<U>>,
    ) -> TypedInputIdWithKind<T, FunctionId<T>> {
        let function = ReactiveFunction::new(func).instantiate(arg.into());
        let map = self.inputs.map_for_mut::<T>();
        map.add_function(function)
    }

    pub fn update<T: Debug + Clone + 'static>(
        &mut self,
        id: TypedInputIdWithKind<T, CellId<T>>,
        value: T,
    ) {
        self.revision = self.revision.increment();

        let map = self.inputs.map_for_mut::<T>();
        let cell = map.get_cell_mut(id);

        cell.update(value, self.revision);
    }

    pub fn revision<T: Debug + Clone + 'static>(
        &self,
        id: impl Into<TypedInputId<T>>,
    ) -> Option<Revision> {
        let id = id.into();
        id.revision(&self.inputs)
    }

    pub fn output<T: Debug + Clone + 'static>(
        &self,
        id: impl Into<TypedInputId<T>>,
    ) -> PrimitiveOutput<T> {
        let id = id.into();
        let value = id.value(&self.inputs);
        PrimitiveOutput::new(value, id)
    }

    pub(crate) fn inputs(&self) -> &Inputs {
        &self.inputs
    }
}
