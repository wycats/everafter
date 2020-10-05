use everafter::timeline::Timeline;
use everafter::{func, GetReactiveKey, Key};

use uuid::Uuid;

mod common;
use common::Test;

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
fn primitive_function_one_arg() {
    let mut timeline = Timeline::new();

    func!(print_person(person: Person) -> String {
        format!("{} in {:?}", person.name, person.location)
    });

    // initialize inputs
    let mut transaction = timeline.setup();
    let p1 = transaction.cell(Person::new("Niko Matsakis", Location::UnitedStates));
    let printed_p1 = transaction.derived(print_person(p1));
    let p2 = transaction.cell(Person::new("Andres Robalino", Location::Ecuador));
    let printed_p2 = transaction.derived(print_person(p2));
    let p3 = transaction.cell(Person::new("Santiago Pastorino", Location::Uruguay));
    let printed_p3 = transaction.derived(print_person(p3));

    // initialize outputs
    let mut output1 = timeline.output(printed_p1);
    let mut output2 = timeline.output(printed_p2);
    let mut output3 = timeline.output(printed_p3);

    // archive
    let mut transaction = timeline.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);
    output3.update(&mut transaction);

    assert_eq!(output1.value(), "Niko Matsakis in UnitedStates");
    assert_eq!(output2.value(), "Andres Robalino in Ecuador");
    assert_eq!(output3.value(), "Santiago Pastorino in Uruguay");

    // edit
    timeline
        .update()
        .update(p1, Person::new("Niko Matsakis", Location::Greece));

    // archive
    let mut transaction = timeline.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);
    output3.update(&mut transaction);

    assert_eq!(output1.value(), "Niko Matsakis in Greece");
    assert_eq!(output2.value(), "Andres Robalino in Ecuador");
    assert_eq!(output3.value(), "Santiago Pastorino in Uruguay");
}

#[test]
fn primitive_function_n_args() {
    let mut test = Test::new();

    func!(print_people(person1: Person, person2: Person) -> String {
        format!("{} and {}", person1.name, person2.name)
    });

    // initialize inputs
    let mut p1 = test.cell("niko", Person::new("Niko Matsakis", Location::UnitedStates));
    let p2 = test.cell("andres", Person::new("Andres Robalino", Location::Ecuador));
    let p3 = test.cell(
        "santiago",
        Person::new("Santiago Pastorino", Location::Uruguay),
    );
    let mut p4 = test.cell("yehuda", Person::new("Yehuda Katz", Location::UnitedStates));

    let printed_rust_peeps = test.derived("rust peeps", print_people(&p1, &p3));
    let printed_nu_peeps = test.derived("nu peeps", print_people(&p2, &p4));

    // initialize outputs
    let mut output1 = printed_rust_peeps.output("printed rust peeps", &test);
    let mut output2 = printed_nu_peeps.output("printed nu peeps", &test);

    // archive
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);

    output1.expect("Niko Matsakis and Santiago Pastorino", "initialized");
    output2.expect("Andres Robalino and Yehuda Katz", "initialized");

    // edit
    p1.update(&mut test, Person::new("Niko Matsakis", Location::Greece));
    p4.update(
        &mut test,
        Person::new("Yehuda S. Katz", Location::UnitedStates),
    );

    // test.assert_changed

    // archive
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);

    output1.expect("Niko Matsakis and Santiago Pastorino", "after update");
    output2.expect("Andres Robalino and Yehuda S. Katz", "after update");
}

#[test]
fn test_function_calling_function() {
    let mut test = Test::new();

    func!(people(person1: Person, person2: Person) -> Vec<Person> {
        vec![person1, person2]
    });

    func!(print_people(people: Vec<Person>) -> String {
        format!("{}", itertools::Itertools::join(&mut people.iter().map(|p| &p.name), " and "))
    });

    // initialize inputs
    let mut p1 = test.cell("niko", Person::new("Niko Matsakis", Location::UnitedStates));
    let p2 = test.cell("andres", Person::new("Andres Robalino", Location::Ecuador));
    let p3 = test.cell(
        "santiago",
        Person::new("Santiago Pastorino", Location::Uruguay),
    );
    let mut p4 = test.cell("yehuda", Person::new("Yehuda Katz", Location::UnitedStates));

    let rust_peeps = test.derived("rust peeps", people(&p1, &p3));
    let nu_peeps = test.derived("nu peeps", people(&p2, &p4));

    let printed_rust_peeps = test.derived("printed rust peeps", print_people(&rust_peeps));
    let printed_nu_peeps = test.derived("printed nu peeps", print_people(&nu_peeps));

    // initialize outputs
    let mut output1 = printed_rust_peeps.output("printed rust peeps", &test);
    let mut output2 = printed_nu_peeps.output("printed nu peeps", &test);

    // archive
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);

    output1.expect("Niko Matsakis and Santiago Pastorino", "initialized");
    output2.expect("Andres Robalino and Yehuda Katz", "initialized");

    // edit
    p1.update(&mut test, Person::new("Niko Matsakis", Location::Greece));
    p4.update(
        &mut test,
        Person::new("Yehuda S. Katz", Location::UnitedStates),
    );

    // test.assert_changed

    // archive
    let mut transaction = test.begin();
    output1.update(&mut transaction);
    output2.update(&mut transaction);

    output1.expect("Niko Matsakis and Santiago Pastorino", "after update");
    output2.expect("Andres Robalino and Yehuda S. Katz", "after update");
}
