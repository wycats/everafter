use std::fmt::Debug;

use crate::{
    inputs::{DerivedTag, ReactiveTag},
    TypedInputId,
};

use super::inputs::Inputs;

#[derive(Debug)]
pub struct EvaluationContext<'a> {
    stack: Vec<DerivedTag>,
    pub(crate) inputs: &'a Inputs,
}

impl<'a> EvaluationContext<'a> {
    pub(crate) fn new(inputs: &Inputs) -> EvaluationContext<'_> {
        EvaluationContext {
            stack: vec![],
            inputs,
        }
    }

    pub(crate) fn push(&mut self, tag: DerivedTag) {
        self.stack.push(tag);
    }

    pub(crate) fn pop(&mut self) -> DerivedTag {
        self.stack.pop().expect("popped a tag without pushing one")
    }

    pub(crate) fn consume(&self, tag: ReactiveTag) {
        if let Some(current) = self.stack.last() {
            current.consume(tag);
        }
    }

    pub fn value<T>(&mut self, id: impl Into<TypedInputId<T>>) -> T
    where
        T: Debug + Clone + 'static,
    {
        self.inputs.value(id, self)
    }
}
