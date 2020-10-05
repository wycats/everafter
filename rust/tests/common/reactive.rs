use std::{fmt::Debug, marker::PhantomData};

use derive_new::new;
use getset::Getters;

use everafter::{
    outputs::PrimitiveOutput,
    timeline::{
        CellId, DerivedId, EvaluationContext, IdKindFor, RenderTransaction, Timeline,
        TypedInputIdWithKind,
    },
    Revision,
};

#[derive(new, Getters)]
pub struct Test {
    #[get]
    #[new(default)]
    timeline: Timeline,
}

impl Test {
    pub fn begin(&mut self) -> RenderTransaction<'_> {
        self.timeline.begin()
    }

    pub fn cell<T: Debug + Clone + 'static>(
        &mut self,
        desc: &'static str,
        value: T,
    ) -> TestReactive<T, CellId<T>> {
        let mut timeline = self.timeline.setup();
        let cell = timeline.cell(value);
        let revision = self
            .timeline
            .revision(cell)
            .expect("cell unexpectedly initialized with a None revision");

        TestReactive {
            desc: desc,
            handle: cell,
            marker: PhantomData,
            last_revision: Some(revision),
        }
    }

    pub fn derived<T: Debug + Clone + 'static>(
        &mut self,
        desc: &'static str,
        computation: impl Fn(&mut EvaluationContext) -> T + 'static,
    ) -> TestReactive<T, DerivedId<T>> {
        let mut timeline = self.timeline.setup();
        let derived = timeline.derived(computation);

        TestReactive {
            desc: desc,
            handle: derived,
            marker: PhantomData,
            last_revision: None,
        }
    }

    pub fn assert_unchanged<T, K>(&self, reactive: &TestReactive<T, K>, desc: &'static str)
    where
        T: Debug + Clone + 'static,
        K: IdKindFor<T>,
    {
        let revision = self.timeline.revision(reactive.handle);

        assert_eq!(
            revision, reactive.last_revision,
            "expected the revision for {} to remain stable ({})",
            reactive.desc, desc
        )
    }

    pub fn assert_changed<T, K>(&self, reactive: &mut TestReactive<T, K>, desc: &'static str)
    where
        T: Debug + Clone + 'static,
        K: IdKindFor<T>,
    {
        let revision = self.timeline.revision(reactive.handle);

        assert_ne!(
            revision, reactive.last_revision,
            "expected the revision for {} to have changed ({})",
            reactive.desc, desc
        );

        reactive.last_revision = revision;
    }
}

#[derive(Debug, Getters)]
pub struct TestReactive<T, K>
where
    T: Debug + Clone + 'static,
    K: IdKindFor<T>,
{
    desc: &'static str,
    handle: TypedInputIdWithKind<T, K>,
    marker: PhantomData<T>,
    last_revision: Option<Revision>,
}

impl<T, K> TestReactive<T, K>
where
    T: Debug + Clone + PartialEq + 'static,
    K: IdKindFor<T>,
{
    pub fn handle(&self) -> TypedInputIdWithKind<T, K> {
        self.handle
    }

    pub fn output(&self, desc: &'static str, test: &Test) -> TestPrimitiveOutput<T> {
        return TestPrimitiveOutput {
            desc,
            output: test.timeline.output(self.handle),
        };
    }
}

pub struct TestPrimitiveOutput<T>
where
    T: Debug + Clone + 'static,
{
    desc: &'static str,
    output: PrimitiveOutput<T>,
}

impl<T> TestPrimitiveOutput<T>
where
    T: Debug + Clone + PartialEq + 'static,
{
    pub fn expect(&self, expected: T, reason: &'static str) {
        let actual = self.output.value().clone();

        assert_eq!(actual, expected, "{}: {}", self.desc, reason)
    }

    pub fn update(&mut self, test: &mut RenderTransaction<'_>) {
        // test.timeline.begin().update(id, value)
        self.output.update(test);
    }
}

impl<T> TestReactive<T, CellId<T>>
where
    T: Debug + Clone + 'static,
{
    pub fn update(&mut self, test: &mut Test, value: T) {
        test.timeline.update().update(self.handle, value);
    }
}
