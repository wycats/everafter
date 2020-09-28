use getset::Getters;
use parking_lot::Mutex;
use std::{fmt::Debug, sync::Arc};

use crate::inputs::{ReactiveCell, ReactiveComputation};

#[derive(Debug, Getters)]
pub(crate) struct PrimitiveOutput<T: Debug + Clone> {
    #[get = "pub(crate)"]
    value: T,
    primitive: ReactivePrimitive<T>,
}

impl<T: Debug + Clone> PrimitiveOutput<T> {
    pub(crate) fn cell(cell: Arc<Mutex<ReactiveCell<T>>>) -> PrimitiveOutput<T> {
        let primitive = ReactivePrimitive::Cell(cell);
        let value = primitive.value();

        PrimitiveOutput { value, primitive }
    }

    pub(crate) fn update(&mut self) {
        let new_value = self.primitive.value();
        self.value = new_value;
    }
}

#[derive(Debug)]
enum ReactivePrimitive<T: Debug + Clone> {
    Cell(Arc<Mutex<ReactiveCell<T>>>),
    Computation(ReactiveComputation<T>),
}

impl<T: Debug + Clone> ReactivePrimitive<T> {
    fn value(&self) -> T {
        match self {
            ReactivePrimitive::Cell(cell) => cell.lock().read(),
            ReactivePrimitive::Computation(cell) => cell.read(),
        }
    }
}
