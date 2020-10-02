use std::fmt::Debug;

use derive_new::new;

use crate::{
    inputs::{
        function::DynamicFunction, function::ReactiveFunction, DerivedTag, ReactiveCell,
        ReactiveDerived, Tag,
    },
    outputs::PrimitiveOutput,
};

use super::{
    inputs::Inputs, partition::PartitionedInputs, CellId, DerivedId, FunctionId, IdKindFor,
    Revision, TypedInputId, TypedInputIdWithKind,
};

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

impl Timeline {
    pub fn revision<T: Debug + Clone + 'static>(
        &self,
        id: TypedInputIdWithKind<T, impl IdKindFor<T>>,
    ) -> Option<Revision> {
        let id = id.into();
        self.inputs.get_revision(id)
    }

    pub fn output<T: Debug + Clone + 'static>(
        &self,
        _id: impl Into<TypedInputId<T>>,
    ) -> PrimitiveOutput<T> {
        unimplemented!()
        // let _id = id.into();
        // let value = unimplemented!();
        // PrimitiveOutput::new(value, id)
    }

    pub fn begin(&mut self) -> TimelineTransaction<'_> {
        TimelineTransaction { timeline: self }
    }
}

#[derive(Debug)]
pub struct TimelineTransaction<'a> {
    timeline: &'a mut Timeline,
}

impl<'a> TimelineTransaction<'a> {
    pub fn commit(self) {}

    fn increment_revision(&mut self) -> Revision {
        let revision = self.timeline.revision.increment();
        self.timeline.revision = revision;
        revision
    }

    // fn input_map<T>(&mut self) -> &mut TypedInputs<T>
    // where
    //     T: Debug + Clone + 'static,
    // {
    //     self.timeline.inputs.map_for_mut::<T>()
    // }

    pub(crate) fn get_value<T>(&mut self, _input: TypedInputId<T>) -> T
    where
        T: Debug + Clone + 'static,
    {
        unimplemented!()
        // self.input_map().get
    }

    pub fn cell<T: Debug + Clone + 'static>(
        &mut self,
        value: T,
    ) -> TypedInputIdWithKind<T, CellId<T>> {
        let cell = ReactiveCell::new(value, Tag::arc(self.timeline.revision.atomic()));
        self.timeline.inputs.add_cell::<T>(cell)
    }

    pub fn derived<T: Debug + Clone + 'static>(
        &mut self,
        computation: impl Fn(PartitionedInputs<'_>) -> T + 'static,
    ) -> TypedInputIdWithKind<T, DerivedId<T>> {
        let derived = ReactiveDerived::new(Some(DerivedTag::default()), Box::new(computation));
        self.timeline.inputs.add_derived::<T>(derived)
    }

    pub fn function<T: Debug + Clone + 'static, U: Debug + Clone + 'static>(
        &mut self,
        func: DynamicFunction<T>,
        arg: impl Into<TypedInputId<U>>,
    ) -> TypedInputIdWithKind<T, FunctionId<T>> {
        let function = ReactiveFunction::new(func).instantiate(arg.into());
        self.timeline.inputs.add_function::<T>(function)
    }

    pub fn update<T: Debug + Clone + 'static>(
        &mut self,
        id: TypedInputIdWithKind<T, CellId<T>>,
        value: T,
    ) {
        let revision = self.increment_revision();

        self.timeline.inputs.update_cell(id, value, revision);
    }
}
