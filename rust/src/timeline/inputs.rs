use std::{fmt::Debug, hash::Hash, marker::PhantomData};

use fxtypemap::TypeMap;
use indexmap::IndexMap;

use crate::inputs::{ReactiveCell, ReactiveComputation};

#[derive(Debug, Copy, Clone, Hash, Eq, PartialEq)]
pub(crate) struct InputId {
    id: u64,
}

impl InputId {
    fn first() -> InputId {
        InputId { id: 0 }
    }

    fn next(self) -> InputId {
        InputId { id: self.id + 1 }
    }
}

#[derive(Debug)]
pub(crate) struct TypedCellId<T> {
    id: InputId,
    marker: PhantomData<T>,
}

impl<T> TypedCellId<T> {
    fn first() -> TypedCellId<T> {
        TypedCellId {
            id: InputId::first(),
            marker: PhantomData,
        }
    }

    fn next(self) -> TypedCellId<T> {
        TypedCellId {
            id: self.id.next(),
            marker: PhantomData,
        }
    }
}

#[derive(Debug)]
pub(crate) struct TypedDerivedId<T> {
    id: InputId,
    marker: PhantomData<T>,
}

impl<T> TypedDerivedId<T> {
    fn first() -> TypedDerivedId<T> {
        TypedDerivedId {
            id: InputId::first(),
            marker: PhantomData,
        }
    }

    fn next(self) -> TypedDerivedId<T> {
        TypedDerivedId {
            id: self.id.next(),
            marker: PhantomData,
        }
    }
}

#[derive(Debug)]
pub(crate) struct TypedInputs<T: Debug + Clone + 'static> {
    cells: IndexMap<TypedCellId<T>, ReactiveCell<T>>,
    next_cell_id: TypedCellId<T>,
    derived: IndexMap<TypedDerivedId<T>, ReactiveComputation<T>>,
    next_derived_id: TypedDerivedId<T>,
}

impl<T: Debug + Clone + 'static> TypedInputs<T> {
    pub(crate) fn for_type() -> TypedInputs<T> {
        TypedInputs::<T> {
            cells: IndexMap::new(),
            next_cell_id: TypedCellId::first(),
            derived: IndexMap::new(),
            next_derived_id: TypedDerivedId::first(),
        }
    }

    pub(crate) fn add_cell(&mut self, value: ReactiveCell<T>) -> TypedCellId<T> {
        let next = self.next_cell_id();
        self.cells.insert(next, value);
        next
    }

    pub(crate) fn add_derived(&mut self, value: ReactiveComputation<T>) -> TypedDerivedId<T> {
        let next = self.next_derived_id();
        self.derived.insert(next, value);
        next
    }

    pub(crate) fn get_cell(&self, id: TypedCellId<T>) -> &ReactiveCell<T> {
        self.cells.get(&id).expect("typed cell didn't exist")
    }

    pub(crate) fn get_derived(&self, id: TypedDerivedId<T>) -> &ReactiveComputation<T> {
        self.derived.get(&id).expect("typed cell didn't exist")
    }

    pub(crate) fn get_cell_mut(&mut self, id: TypedCellId<T>) -> &mut ReactiveCell<T> {
        self.cells.get_mut(&id).expect("typed cell didn't exist")
    }

    pub(crate) fn get_derived_mut(&mut self, id: TypedDerivedId<T>) -> &mut ReactiveComputation<T> {
        self.derived.get_mut(&id).expect("typed cell didn't exist")
    }

    fn next_cell_id(&mut self) -> TypedCellId<T> {
        let next = self.next_cell_id;
        self.next_cell_id = next.next();
        next
    }

    fn next_derived_id(&mut self) -> TypedDerivedId<T> {
        let next = self.next_derived_id;
        self.next_derived_id = next.next();
        next
    }
}

#[derive(Default)]
pub(crate) struct Inputs {
    map: TypeMap,
    types: Vec<String>,
}

impl Inputs {
    pub(crate) fn read_cell<T: Debug + Clone + 'static>(&self, id: TypedCellId<T>) -> T {
        let map = self.map_for::<T>();
        map.get_cell(id).read()
    }

    pub(crate) fn compute_derived<T: Debug + Clone + 'static>(&self, id: TypedDerivedId<T>) -> T {
        let map = self.map_for::<T>();
        map.get_derived(id).compute(self)
    }

    pub(crate) fn register_map<T: Debug + Clone + 'static>(&mut self) {
        let type_name = std::any::type_name::<T>();

        if self.map.contains::<TypedInputs<T>>() {
            panic!(
                "Attempted to register a map for {:?} but it was already registered",
                std::any::type_name::<T>()
            );
        } else {
            self.map.insert::<TypedInputs<T>>(TypedInputs::for_type());
            self.types.push(type_name.to_string());
        }
    }

    pub(crate) fn map_for<T: Debug + Clone + 'static>(&self) -> &TypedInputs<T> {
        if self.map.contains::<TypedInputs<T>>() {
            self.map.get::<TypedInputs<T>>().unwrap()
        } else {
            panic!(
                "Attempted to get map for {:?} but it wasn't registered",
                std::any::type_name::<T>()
            )
        }
    }

    pub(crate) fn map_for_mut<T: Debug + Clone + 'static>(&mut self) -> &mut TypedInputs<T> {
        if self.map.contains::<TypedInputs<T>>() {
            self.map.get_mut::<TypedInputs<T>>().unwrap()
        } else {
            panic!(
                "Attempted to get map for {:?} but it wasn't registered",
                std::any::type_name::<T>()
            )
        }
    }
}

impl Debug for Inputs {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut debug = IndexMap::new();
        debug.insert("types", &self.types);
        write!(f, "{:?}", debug)
    }
}

impl<T> Hash for TypedCellId<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state)
    }
}

impl<T> Hash for TypedDerivedId<T> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.id.hash(state)
    }
}

impl<T> PartialEq for TypedCellId<T> {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl<T> PartialEq for TypedDerivedId<T> {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl<T> Eq for TypedCellId<T> {}
impl<T> Eq for TypedDerivedId<T> {}

impl<T> Copy for TypedCellId<T> {}
impl<T> Clone for TypedCellId<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T> Copy for TypedDerivedId<T> {}
impl<T> Clone for TypedDerivedId<T> {
    fn clone(&self) -> Self {
        *self
    }
}
