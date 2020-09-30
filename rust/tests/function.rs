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
    let p1 = timeline.cell(Person::new("Niko Matsakis", Location::UnitedStates));
    let printed_p1 = timeline.function(print_person, p1);
    let p2 = timeline.cell(Person::new("Andres Robalino", Location::Ecuador));
    let printed_p2 = timeline.function(print_person, p2);
    let p3 = timeline.cell(Person::new("Santiago Pastorino", Location::Uruguay));
    let printed_p3 = timeline.function(print_person, p3);

    // initialize outputs
    let mut output1 = timeline.output(printed_p1);
    let mut output2 = timeline.output(printed_p2);
    let mut output3 = timeline.output(printed_p3);

    assert_eq!(output1.value(), "Niko Matsakis in UnitedStates");
    assert_eq!(output2.value(), "Andres Robalino in Ecuador");
    assert_eq!(output3.value(), "Santiago Pastorino in Uruguay");

    // edit
    timeline.update(p1, Person::new("Niko Matsakis", Location::Greece));

    // archive
    timeline.update_output(&mut output1);
    timeline.update_output(&mut output2);
    timeline.update_output(&mut output3);

    assert_eq!(output1.value(), "Niko Matsakis in Greece");
    assert_eq!(output2.value(), "Andres Robalino in Ecuador");
    assert_eq!(output3.value(), "Santiago Pastorino in Uruguay");
}
