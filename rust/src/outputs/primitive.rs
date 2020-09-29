use std::fmt::Debug;

use derive_new::new;
use getset::Getters;

use crate::timeline::{Inputs, TypedInputId};

#[derive(Debug, Getters, new)]
pub struct PrimitiveOutput<T: Debug + Clone + 'static> {
    #[get = "pub"]
    value: T,
    primitive: TypedInputId<T>,
}

impl<T: Debug + Clone + 'static> PrimitiveOutput<T> {
    pub(crate) fn update(&mut self, inputs: &mut Inputs) {
        let new_value = self.primitive.value(inputs);
        self.value = new_value;
    }
}
