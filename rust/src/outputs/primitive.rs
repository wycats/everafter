use std::fmt::Debug;

use derive_new::new;
use getset::Getters;

use crate::{inputs::ReactiveInput, timeline::Inputs};

#[derive(Debug, Getters, new)]
pub(crate) struct PrimitiveOutput<T: Debug + Clone + 'static> {
    #[get = "pub(crate)"]
    value: T,
    primitive: ReactiveInput<T>,
}

impl<T: Debug + Clone + 'static> PrimitiveOutput<T> {
    pub(crate) fn update(&mut self, inputs: &mut Inputs) {
        let new_value = self.primitive.value(inputs);
        self.value = new_value;
    }
}
