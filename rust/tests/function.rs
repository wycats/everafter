use everafter::timeline::Timeline;
use everafter::{func, GetReactiveKey, Key};

use uuid::Uuid;

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
fn primitive_list() {
    let mut timeline = Timeline::new();

    func!(print_person(person: Person) -> String {
        format!("{} in {:?}", person.name, person.location)
    });

    // initialize inputs
    let mut transaction = timeline.begin();
    let p1 = transaction.cell(Person::new("Niko Matsakis", Location::UnitedStates));
    let printed_p1 = transaction.function(print_person, p1);
    let p2 = transaction.cell(Person::new("Andres Robalino", Location::Ecuador));
    let printed_p2 = transaction.function(print_person, p2);
    let p3 = transaction.cell(Person::new("Santiago Pastorino", Location::Uruguay));
    let printed_p3 = transaction.function(print_person, p3);

    // initialize outputs
    let mut output1 = timeline.output(printed_p1);
    let mut output2 = timeline.output(printed_p2);
    let mut output3 = timeline.output(printed_p3);

    assert_eq!(output1.value(), "Niko Matsakis in UnitedStates");
    assert_eq!(output2.value(), "Andres Robalino in Ecuador");
    assert_eq!(output3.value(), "Santiago Pastorino in Uruguay");

    // edit
    timeline
        .begin()
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
