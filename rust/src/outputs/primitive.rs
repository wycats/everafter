use std::fmt::Debug;

use derive_new::new;
use getset::Getters;

use crate::timeline::{RenderTransaction, TypedInputId};

#[derive(Debug, Getters, new)]
pub struct PrimitiveOutput<T: Debug + Clone + 'static> {
    value: Option<T>,
    primitive: TypedInputId<T>,
}

impl<T: Debug + Clone + 'static> PrimitiveOutput<T> {
    pub fn initialize(&mut self, timeline: &mut RenderTransaction) {
        self.update(timeline)
    }

    pub fn update(&mut self, timeline: &mut RenderTransaction) {
        let new_value = timeline.get_value(self.primitive);
        self.value = Some(new_value);
    }

    pub fn value(&self) -> T {
        self.value
            .clone()
            .expect("Cannot get an output's value before it was updated for the first time")
    }
}
