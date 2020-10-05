mod common;
use common::Test;
use everafter::{timeline::EvaluationContext, GetReactiveKey, Key, TypedInputId};
use uuid::Uuid;

#[test]
fn primitive_cell() {
    let mut test = Test::new();

    // initialize inputs
    let mut input = test.cell("input", 1);

    // initialize outputs
    let mut output1 = input.output("output1", &test);
    let mut output2 = input.output("output2", &test);

    test.assert_unchanged(&input, "after initializing outputs");

    // edit
    input.update(&mut test, 2);

    test.assert_changed(&mut input, "after input update");

    // archive
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);

    output1.expect(2, "updated value");
    output2.expect(2, "updated value");

    test.assert_unchanged(&input, "after output update");
}

#[test]
fn primitive_derived() {
    let mut test = Test::new();

    let mut input1 = test.cell("input1", 1);
    let mut input2 = test.cell("input2", 2);

    // derived computations work with Copy data, but test inputs are refs because they track last
    // revisions.
    let i1 = input1.handle();
    let i2 = input2.handle();

    let mut derived = test.derived("derived", move |ctx: &mut EvaluationContext| -> i32 {
        ctx.value(i1) + ctx.value(i2)
    });

    test.assert_changed(&mut derived, "initially");

    // initialize outputs
    let mut output1 = derived.output("output1", &mut test);
    let mut output2 = derived.output("output2", &mut test);

    test.assert_unchanged(&mut derived, "after initialization");

    // render
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);

    output1.expect(3, "initial value");
    output2.expect(3, "initial value");

    // edit
    input1.update(&mut test, 5);
    input2.update(&mut test, 10);

    test.assert_changed(&mut derived, "after update");

    // archive
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);

    output1.expect(15, "after update");
    output2.expect(15, "after update");
}

#[derive(Debug, Clone, Eq, PartialEq)]
enum Location {
    UnitedStates,
    Uruguay,
    Ecuador,
    Greece,
}

#[derive(Debug, Clone, Eq, PartialEq)]
struct Person {
    id: Uuid,
    name: String,
    location: Location,
}

impl Person {
    fn new(name: impl Into<String>, location: Location) -> Person {
        Person {
            id: Uuid::new_v4(),
            name: name.into(),
            location,
        }
    }
}

impl GetReactiveKey for Person {
    fn get_reactive_key(&self) -> Key {
        Key::number(self.id.as_u128())
    }
}

#[test]
fn primitive_function() {
    let mut test = Test::new();

    // func!(print_person(person: Person) -> String {
    //     format!("{} in {:?}", person.name, person.location)
    // });

    let print_person = |ctx: &mut EvaluationContext, p: TypedInputId<Person>| {
        let person = ctx.value(p);
        format!("{} in {:?}", person.name, person.location)
    };

    // initialize inputs
    let mut p1 = test.cell("niko", Person::new("Niko Matsakis", Location::UnitedStates));
    let p1_handle = p1.handle();
    let printed_p1 = test.derived("print niko", move |ctx: &mut EvaluationContext| {
        print_person(ctx, p1_handle.into())
    });
    let p2 = test.cell("andres", Person::new("Andres Robalino", Location::Ecuador));
    let p2_handle = p2.handle();
    let printed_p2 = test.derived("print andres", move |ctx: &mut EvaluationContext| {
        print_person(ctx, p2_handle.into())
    });
    let p3 = test.cell(
        "santiago",
        Person::new("Santiago Pastorino", Location::Uruguay),
    );
    let p3_handle = p3.handle();
    let printed_p3 = test.derived("print santiago", move |ctx: &mut EvaluationContext| {
        print_person(ctx, p3_handle.into())
    });

    // initialize outputs
    let mut output1 = printed_p1.output("niko output", &test);
    let mut output2 = printed_p2.output("andres output", &test);
    let mut output3 = printed_p3.output("santiago output", &test);

    // archive
    let mut render = test.begin();
    output1.update(&mut render);
    output2.update(&mut render);
    output3.update(&mut render);

    // let mut update = test.begin();
    output1.expect("Niko Matsakis in UnitedStates", "after update");
    output2.expect("Andres Robalino in Ecuador", "after update");
    output3.expect("Santiago Pastorino in Uruguay", "after update");

    // edit

    p1.update(&mut test, Person::new("Niko Matsakis", Location::Greece));

    // archive
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);
    output3.update(&mut transaction);

    output1.expect("Niko Matsakis in Greece", "after update");
    output2.expect("Andres Robalino in Ecuador", "after update");
    output3.expect("Santiago Pastorino in Uruguay", "after update");
}
