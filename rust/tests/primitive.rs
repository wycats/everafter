use derive_new::new;
use getset::Getters;
use std::{fmt::Debug, marker::PhantomData};

use everafter::{
    outputs::PrimitiveOutput,
    timeline::{CellId, DerivedId, IdKindFor, Inputs, Timeline, TypedInputIdWithKind},
    Revision,
};

#[derive(new, Getters)]
struct Test {
    #[get]
    #[new(default)]
    timeline: Timeline,
}

impl Test {
    fn cell<T: Debug + Clone + 'static>(
        &mut self,
        desc: &'static str,
        value: T,
    ) -> TestReactive<T, CellId<T>> {
        let cell = self.timeline.cell(value);
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

    fn derived<T: Debug + Clone + 'static>(
        &mut self,
        desc: &'static str,
        computation: impl Fn(&Inputs) -> T + 'static,
    ) -> TestReactive<T, DerivedId<T>> {
        let derived = self.timeline.derived(computation);

        TestReactive {
            desc: desc,
            handle: derived,
            marker: PhantomData,
            last_revision: None,
        }
    }

    fn assert_unchanged<T, K>(&self, reactive: &TestReactive<T, K>)
    where
        T: Debug + Clone + 'static,
        K: IdKindFor<T>,
    {
        let revision = reactive.handle.revision(&self.timeline);

        assert_eq!(
            revision, reactive.last_revision,
            "expected the revision for {} to remain stable",
            reactive.desc
        )
    }

    fn assert_changed<T, K>(&self, reactive: &mut TestReactive<T, K>)
    where
        T: Debug + Clone + 'static,
        K: IdKindFor<T>,
    {
        let revision = reactive.handle.revision(&self.timeline);

        assert_ne!(
            revision, reactive.last_revision,
            "expected the revision for {} to have changed",
            reactive.desc
        );

        reactive.last_revision = revision;
    }
}

#[derive(Debug)]
struct TestReactive<T, K>
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
    fn output(&self, desc: &'static str, test: &mut Test) -> TestPrimitiveOutput<T> {
        return TestPrimitiveOutput {
            desc,
            output: test.timeline.output(self.handle),
        };
    }
}

struct TestPrimitiveOutput<T>
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
    fn expect(&self, expected: T, reason: &'static str) {
        let actual = self.output.value().clone();

        assert_eq!(actual, expected, "{}: {}", self.desc, reason)
    }

    pub fn update(&mut self, test: &Test) {
        self.output.update(&test.timeline);
    }
}

impl<T> TestReactive<T, CellId<T>>
where
    T: Debug + Clone + 'static,
{
    fn update(&mut self, test: &mut Test, value: T) {
        test.timeline.update(self.handle, value);
    }
}

#[test]
fn primitive_cell() {
    let mut test = Test::new();

    // initialize inputs
    let mut input = test.cell("input", 1);

    // initialize outputs
    let mut output1 = input.output("output1", &mut test);
    let mut output2 = input.output("output2", &mut test);

    output1.expect(1, "initial value");
    output2.expect(1, "initial value");
    test.assert_unchanged(&input);

    // edit
    input.update(&mut test, 2);

    test.assert_changed(&mut input);

    // archive
    output1.update(&test);
    output2.update(&test);

    output1.expect(2, "updated value");
    output2.expect(2, "updated value");

    test.assert_unchanged(&input);
}

#[test]
fn primitive_derived() {
    let mut test = Test::new();

    let mut input1 = test.cell("input1", 1);
    let mut input2 = test.cell("input2", 2);

    // derived computations work with Copy data, but test inputs are refs because they track last
    // revisions.
    let i1 = input1.handle;
    let i2 = input2.handle;

    let derived = test.derived("derived", move |inputs: &Inputs| -> i32 {
        i1.value(inputs) + i2.value(inputs)
    });

    // initialize outputs
    let mut output1 = derived.output("output1", &mut test);
    let mut output2 = derived.output("output2", &mut test);

    output1.expect(3, "initial value");
    output2.expect(3, "initial value");

    // edit
    input1.update(&mut test, 5);
    input2.update(&mut test, 10);

    // archive
    output1.update(&test);
    output2.update(&test);

    output1.expect(15, "after update");
    output2.expect(15, "after update");
}
