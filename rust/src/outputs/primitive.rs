use std::fmt::Debug;

use derive_new::new;
use getset::Getters;

use crate::timeline::{Timeline, TypedInputId};

#[derive(Debug, Getters, new)]
pub struct PrimitiveOutput<T: Debug + Clone + 'static> {
    #[get = "pub"]
    value: T,
    primitive: TypedInputId<T>,
}

impl<T: Debug + Clone + 'static> PrimitiveOutput<T> {
    pub fn update(&mut self, timeline: &Timeline) {
        let new_value = self.primitive.value(timeline.inputs());
        self.value = new_value;
    }
}
