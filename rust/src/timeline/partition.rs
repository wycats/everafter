use std::{fmt::Debug, marker::PhantomData};

use fxtypemap::TypeMap;
use indexmap::IndexMap;

use crate::{
    inputs::ReactiveCell, inputs::ReactiveDerived, inputs::ReactiveFunctionInstance, Reactive,
    Revision, TypedInputId,
};

use super::{
    id::IdKind, id::InputId, inputs::InternalTypedInputs, inputs::TypedInputs, ComputeStack,
    IdKindFor,
};

pub(super) struct PartitionedInternalInputs<'a, T, R>
where
    T: Debug + Clone + 'static,
    R: Reactive,
{
    map: &'a mut IndexMap<InputId, R>,
    t_marker: PhantomData<T>,
}

impl<'a, T, R> PartitionedInternalInputs<'a, T, R>
where
    T: Debug + Clone + 'static,
    R: Reactive,
{
    pub(super) fn from_inputs(
        inputs: &mut InternalTypedInputs<T, impl IdKindFor<T>, R>,
    ) -> PartitionedInternalInputs<T, R> {
        PartitionedInternalInputs {
            map: &mut inputs.map,
            t_marker: PhantomData,
        }
    }

    fn branch<'b>(&'b mut self) -> PartitionedInternalInputs<'b, T, R>
    where
        'a: 'b,
    {
        let map = &mut *self.map;

        PartitionedInternalInputs::<'b> {
            map,
            t_marker: PhantomData,
        }
    }

    pub(super) fn partition<U>(
        &mut self,
        id: TypedInputId<T>,
        cb: impl for<'c> FnOnce(PartitionedInternalInputs<'c, T, R>, Option<&'c mut R>) -> U,
    ) -> U
    where
        U: 'static,
    {
        let branch = self.branch();

        let value = branch.map.remove(&id.as_unchecked_id());

        match value {
            Some(mut v) => {
                let ret = cb(branch, Some(&mut v));
                self.map.insert(id.as_unchecked_id(), v);
                ret
            }
            None => cb(branch, None),
        }
    }

    fn get(&self, id: TypedInputId<T>) -> Option<&R> {
        self.map.get(&id.as_unchecked_id())
    }

    fn get_unchecked(&self, id: InputId) -> Option<&R> {
        self.map.get(&id)
    }

    fn get_mut(&mut self, id: TypedInputId<T>) -> Option<&mut R> {
        self.map.get_mut(&id.as_unchecked_id())
    }

    fn get_unchecked_mut(&mut self, id: InputId) -> Option<&mut R> {
        self.map.get_mut(&id)
    }
}

pub(super) struct PartitionedTypedInputs<'a, T>
where
    T: Debug + Clone + 'static,
{
    stack: &'a mut ComputeStack,
    cells: PartitionedInternalInputs<'a, T, ReactiveCell<T>>,
    derived: PartitionedInternalInputs<'a, T, ReactiveDerived<T>>,
    functions: PartitionedInternalInputs<'a, T, ReactiveFunctionInstance<T>>,
}

impl<'a, T> PartitionedTypedInputs<'a, T>
where
    T: Debug + Clone + 'static,
{
    pub(super) fn from_inputs<'b>(inputs: &'b mut TypedInputs<T>) -> PartitionedTypedInputs<'b, T> {
        PartitionedTypedInputs {
            stack: &mut inputs.stack,
            cells: inputs.cells.split(),
            derived: inputs.derived.split(),
            functions: inputs.functions.split(),
        }
    }

    fn revision(&self, id: InputId, kind: IdKind) -> Option<Revision> {
        match kind {
            IdKind::CellId => Some(*&self.cells.get_unchecked(id)?.get_tag().revision()),
            IdKind::DerivedId => Some(*&self.derived.get_unchecked(id)?.get_tag().revision()),
            IdKind::ListId => unimplemented!("lists are unimplemented"),
            IdKind::FunctionId => Some(*&self.functions.get_unchecked(id)?.get_tag().revision()),
        }
    }

    fn branch<'b>(&'b mut self) -> PartitionedTypedInputs<'b, T> {
        PartitionedTypedInputs {
            stack: self.stack,
            cells: self.cells.branch(),
            derived: self.derived.branch(),
            functions: self.functions.branch(),
        }
    }

    pub(super) fn partition_cell<U>(
        mut self,
        id: TypedInputId<T>,
        cb: impl for<'c> FnOnce(PartitionedTypedInputs<'c, T>, Option<&'c mut ReactiveCell<T>>) -> U,
    ) -> U
    where
        U: 'static,
    {
        let stack: &mut ComputeStack = self.stack;
        let derived: PartitionedInternalInputs<'a, T, ReactiveDerived<T>> = self.derived;
        let functions: PartitionedInternalInputs<'a, T, ReactiveFunctionInstance<T>> =
            self.functions;
        let mut cells = self.cells.branch();

        let result = cells.partition(id, move |cells, cell| {
            cb(
                PartitionedTypedInputs {
                    stack,
                    cells,
                    derived,
                    functions,
                },
                cell,
            )
        });

        result
    }
}

pub struct PartitionedInputs<'a> {
    pub(super) map: &'a mut TypeMap,
    pub(super) types: &'a mut Vec<String>,
}

impl<'a> PartitionedInputs<'a> {
    // pub(super) fn partition_cell<T, U>(
    //     &mut self,
    //     id: TypedInputId<T>,
    //     cb: impl FnOnce(PartitionedInputs, Option<&mut ReactiveCell<T>>) -> U,
    // ) -> U
    // where
    //     T: Debug + Clone + 'static,
    // {
    //     let typed = self.read_map_for::<T>();
    //     typed.cells.partition(id, |cells, cell| {
    //         cb(
    //             PartitionedInputs {
    //                 stack: self.stack,
    //                 cells: cells,
    //                 derived: self.derived.branch(),
    //                 functions: self.functions.branch(),
    //             },
    //             cell,
    //         )
    //     })
    // }

    // pub(crate) fn get_value<T>(&mut self, id: TypedInputIdWithKind<T, impl IdKindFor<T>>) -> T
    // where
    //     T: Debug + Clone + 'static,
    // {
    //     match id.kind() {
    //         IdKind::CellId => self.read_map_for::<T>().get_cell(id.into()).read(),
    //         IdKind::DerivedId => self.map_for_mut::<T>().compute_derived(id.into(), self),
    //         IdKind::ListId => unimplemented!(),
    //         IdKind::FunctionId => self
    //             .map_for_mut::<T>()
    //             .get_function(id.into())
    //             .call(self.public()),
    //     }
    // }

    fn register_map<T: Debug + Clone + 'static>(&mut self) {
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

    pub(crate) fn partition_cell<T, U>(
        self,
        id: TypedInputId<T>,
        cb: impl for<'c> FnOnce(PartitionedInputs<'c>, &'c mut ReactiveCell<T>) -> U,
    ) -> U
    where
        T: Debug + Clone + 'static,
        U: 'static,
    {
        let mut typed_map = self.map.remove::<TypedInputs<T>>().unwrap_or_else(|| {
            panic!(
                "Attempted to get map for {:?} but it wasn't registered",
                std::any::type_name::<T>()
            )
        });

        let map = &mut *self.map;
        let types = &mut *self.types;

        let split = typed_map.split();

        split.partition_cell(id, |_, reactive| {
            let inputs = PartitionedInputs { map, types };

            cb(inputs, reactive.expect("reactive cell wasn't found"))
        })
    }

    pub fn revision<T>(&self, _id: impl Into<TypedInputId<T>>) -> Option<Revision> {
        unimplemented!()
    }

    // pub(crate) fn read_map_for<T: Debug + Clone + 'static>(&self) -> &PartitionedTypedInputs<T> {
    //     if self.map.contains::<TypedInputs<T>>() {
    //         self.map.get::<TypedInputs<T>>().unwrap()
    //     } else {
    //         panic!(
    //             "Attempted to get map for {:?} but it wasn't registered",
    //             std::any::type_name::<T>()
    //         )
    //     }
    // }

    pub fn value<T>(&mut self, _id: impl Into<TypedInputId<T>>) -> T {
        unimplemented!()
    }

    fn read_cell<T>(&mut self, _id: TypedInputId<T>) -> T
    where
        T: Debug + Clone + 'static,
    {
        unimplemented!()
        // self.split().partition(id, |rest, reactive| {
        //     let reactive = reactive.expect("typed cell didn't exist");
        //     self.stack.consume(reactive);
        //     reactive.read()
        // })
    }

    fn compute_derived<T>(&mut self, _id: TypedInputId<T>) -> T
    where
        T: Debug + Clone + 'static,
    {
        unimplemented!()
        // self.split().partition(id, |rest, reactive| {
        //     let reactive = reactive.expect("typed derived didn't exist");
        //     reactive.reset_tag();
        //     self.stack.push(reactive.get_derived_tag());
        //     self.stack.consume(reactive);
        //     reactive.compute(inputs.public())
        // })
    }

    pub(crate) fn call_function<T>(&mut self, _id: TypedInputId<T>) -> T
    where
        T: Debug + Clone + 'static,
    {
        unimplemented!()
        // self.functions.partition(id, |rest, reactive| {
        //     let reactive = reactive.expect("typed function didn't exist");
        //     reactive.reset_tag();
        //     self.stack.push(reactive.get_derived_tag());
        //     self.stack.consume(reactive);
        //     reactive.call(inputs.split())
        // })
    }
}
