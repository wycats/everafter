// use uuid::Uuid;

// use crate::{
//     inputs::iterable::GetReactiveKey, inputs::iterable::Key, timeline::AnyTypedInputId,
//     timeline::Inputs, timeline::TypedInputId,
// };

// #[derive(Debug, Clone)]
// enum Location {
//     UnitedStates,
//     Uruguay,
//     Ecuador,
// }

// #[derive(Debug, Clone)]
// struct Person {
//     id: Uuid,
//     name: String,
//     location: Location,
// }

// impl Person {
//     fn new(name: impl Into<String>, location: Location) -> Person {
//         Person {
//             id: Uuid::new_v4(),
//             name: name.into(),
//             location,
//         }
//     }
// }

// impl GetReactiveKey for Person {
//     fn get_reactive_key(&self) -> Key {
//         Key::number(self.id.as_u128())
//     }
// }

// fn print_person(inputs: &Inputs, args: AnyTypedInputId<Person>) -> String {
//     let person = inputs.read_cell(args);

//     format!("{} in {:?}", person.name, person.location)
// }

// // #[test]
// // fn primitive_list() {
// //     let mut timeline = Timeline::new();

// //     // initialize inputs
// //     let p1 = timeline.cell(Person::new("Niko Matsakis", Location::UnitedStates));
// //     let p2 = timeline.cell(Person::new("Andres Robalino", Location::Ecuador));
// //     let p3 = timeline.cell(Person::new("Santiago Pastorino", Location::Uruguay));

// //     let list = vec![p1, p2, p3];

// //     // initialize outputs
// //     let mut output1 = timeline.output_from_cell(input);
// //     let mut output2 = timeline.output_from_cell(input);

// //     assert_eq!(output1.value(), &1);
// //     assert_eq!(output2.value(), &1);

// //     // edit
// //     timeline.update(input, 2);

// //     // archive
// //     timeline.update_output(&mut output1);
// //     timeline.update_output(&mut output2);

// //     assert_eq!(output1.value(), &2);
// //     assert_eq!(output2.value(), &2);
// // }
