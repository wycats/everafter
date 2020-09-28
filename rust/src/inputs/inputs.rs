use std::fmt::Debug;

use crate::timeline::{inputs::TypedCellId, inputs::TypedDerivedId, Inputs};

#[derive(Debug)]
pub(crate) enum ReactiveInput<T: Debug> {
    Cell(TypedCellId<T>),
    Derived(TypedDerivedId<T>),
}

impl<T: Debug + Clone + 'static> ReactiveInput<T> {
    pub(crate) fn value(&self, inputs: &Inputs) -> T {
        match self {
            ReactiveInput::Cell(cell) => {
                let cells = inputs.map_for::<T>();
                let cell = cells.get_cell(*cell);
                cell.read()
            }
            ReactiveInput::Derived(cell) => {
                let cells = inputs.map_for::<T>();
                let cell = cells.get_derived(*cell);
                cell.compute(inputs)
            }
        }
    }
}
