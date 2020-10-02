use std::fmt::Debug;

use derive_new::new;
use getset::Getters;

use crate::timeline::{timeline::TimelineTransaction, TypedInputId};

#[derive(Debug, Getters, new)]
pub struct PrimitiveOutput<T: Debug + Clone + 'static> {
    #[get = "pub"]
    value: T,
    primitive: TypedInputId<T>,
}

impl<T: Debug + Clone + 'static> PrimitiveOutput<T> {
    pub fn update(&mut self, timeline: &mut TimelineTransaction) {
        let new_value = timeline.get_value(self.primitive);
        self.value = new_value;
    }
}
