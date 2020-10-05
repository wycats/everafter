use std::fmt::Debug;

use derive_new::new;

use crate::{
    inputs::{DerivedTag, DynamicComputation, ReactiveCell, ReactiveDerived, Tag},
    outputs::PrimitiveOutput,
};

use super::{
    inputs::Inputs, CellId, DerivedId, EvaluationContext, Revision, TypedInputId,
    TypedInputIdWithKind,
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
        id: impl Into<TypedInputId<T>>,
    ) -> Option<Revision> {
        let id = id.into();
        self.inputs.revision(id)
    }

    pub fn output<T: Debug + Clone + 'static>(
        &self,
        id: impl Into<TypedInputId<T>>,
    ) -> PrimitiveOutput<T> {
        let id = id.into();
        // let value = unimplemented!();
        PrimitiveOutput::new(None, id)
    }

    pub fn setup(&mut self) -> SetupTransaction<'_> {
        SetupTransaction {
            inputs: &mut self.inputs,
            revision: self.revision,
        }
    }

    pub fn update(&mut self) -> UpdateTransaction<'_> {
        UpdateTransaction {
            inputs: &mut self.inputs,
            revision: self.revision,
        }
    }

    pub fn begin(&mut self) -> RenderTransaction<'_> {
        RenderTransaction {
            revision: self.revision,
            ctx: EvaluationContext::new(&self.inputs),
        }
    }
}

pub struct UpdateTransaction<'a> {
    inputs: &'a mut Inputs,
    revision: Revision,
}

impl<'a> UpdateTransaction<'a> {
    pub fn commit(self, timeline: &mut Timeline) {
        timeline.revision = self.revision
    }

    pub fn update<T: Debug + Clone + 'static>(
        &mut self,
        id: TypedInputIdWithKind<T, CellId<T>>,
        value: T,
    ) {
        let revision = self.increment_revision();

        self.inputs.update_cell(id, value, revision);
    }

    fn increment_revision(&mut self) -> Revision {
        let revision = self.revision.increment();
        self.revision = revision;
        revision
    }
}

#[derive(Debug)]
pub struct RenderTransaction<'a> {
    ctx: EvaluationContext<'a>,
    // does not change during render
    revision: Revision,
}

impl<'a> RenderTransaction<'a> {
    pub fn commit(self) {}

    fn increment_revision(&mut self) -> Revision {
        let revision = self.revision.increment();
        self.revision = revision;
        revision
    }

    pub(crate) fn value<T>(&mut self, id: TypedInputId<T>) -> T
    where
        T: Debug + Clone + 'static,
    {
        self.ctx.inputs.value(id, &mut self.ctx)
    }
}

#[derive(Debug)]
pub struct SetupTransaction<'a> {
    inputs: &'a mut Inputs,
    // does not change during setup
    revision: Revision,
}

impl<'a> SetupTransaction<'a> {
    pub fn commit(self) {}

    pub fn cell<T: Debug + Clone + 'static>(
        &mut self,
        value: T,
    ) -> TypedInputIdWithKind<T, CellId<T>> {
        let cell = ReactiveCell::new(value, Tag::arc(self.revision.atomic()));
        self.inputs.add_cell::<T>(cell)
    }

    pub fn derived<T: Debug + Clone + 'static>(
        &mut self,
        computation: impl DynamicComputation<T> + 'static,
    ) -> TypedInputIdWithKind<T, DerivedId<T>> {
        let derived = ReactiveDerived::new(Some(DerivedTag::default()), Box::new(computation));
        self.inputs.add_derived::<T>(derived)
    }
}
