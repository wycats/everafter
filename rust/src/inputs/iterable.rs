use std::fmt::Debug;

use super::DerivedTag;

#[derive(Debug, Clone, Hash, Eq, PartialEq)]
pub struct Key {
    string: Option<String>,
    number: Option<u128>,
}

impl Key {
    pub fn string(string: impl Into<String>) -> Key {
        Key {
            string: Some(string.into()),
            number: None,
        }
    }

    pub fn number(number: impl Into<u128>) -> Key {
        Key {
            string: None,
            number: Some(number.into()),
        }
    }

    pub fn pair(string: impl Into<String>, number: impl Into<u128>) -> Key {
        Key {
            string: Some(string.into()),
            number: Some(number.into()),
        }
    }
}

pub(crate) struct KeyedItem<Item: Debug + Clone + 'static> {
    key: Key,
    item: Item,
}

pub struct ReactiveList<T: Debug + Clone + 'static> {
    items: Vec<KeyedItem<T>>,
}

pub trait GetReactiveKey {
    fn get_reactive_key(&self) -> Key;
}

pub trait CopyIntoReactiveList<Item: Debug + Clone + 'static> {
    fn copy_into_reactive_list(&self) -> ReactiveList<Item>;
}

impl<T> CopyIntoReactiveList<T> for Vec<T>
where
    T: Debug + Clone + GetReactiveKey + 'static,
{
    fn copy_into_reactive_list(&self) -> ReactiveList<T> {
        ReactiveList {
            items: self
                .iter()
                .map(|item| KeyedItem {
                    key: item.get_reactive_key(),
                    item: item.clone(),
                })
                .collect(),
        }
    }
}

pub(crate) struct ReactiveIterable<T: Debug + Clone + 'static> {
    iterable: Box<dyn CopyIntoReactiveList<T>>,
    tag: DerivedTag,
}
