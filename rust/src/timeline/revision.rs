use atomig::{Atom, Atomic};
use std::cmp::Ordering;
use std::sync::atomic;

#[derive(Debug, Copy, Clone, Ord, PartialOrd, Eq, PartialEq, Atom)]
pub(crate) struct Revision {
    // 0 is the special value const, which has an additional invariant: once the `timestamp` is 0,
    // it must never increase
    timestamp: u64,
}

impl Revision {
    pub(crate) fn timestamp(n: u64) -> Revision {
        assert_ne!(
            n, 0,
            "a timestamp must not be `0`. Use `Revision::constant()`"
        );
        Revision { timestamp: n }
    }

    pub(crate) fn start() -> Revision {
        Revision { timestamp: 1 }
    }

    pub(crate) fn constant() -> Revision {
        Revision { timestamp: 0 }
    }

    pub(crate) fn increment(self) -> Revision {
        Revision {
            timestamp: self.timestamp + 1,
        }
    }

    pub(crate) fn atomic(self) -> AtomicRevision {
        AtomicRevision {
            revision: Atomic::new(self),
        }
    }
}

#[derive(Debug)]
pub(crate) struct AtomicRevision {
    revision: Atomic<Revision>,
}

impl AtomicRevision {
    pub(crate) fn update(&self, revision: Revision) {
        self.revision.swap(revision, atomic::Ordering::SeqCst);
    }

    pub(crate) fn get(&self) -> Revision {
        self.revision.load(atomic::Ordering::SeqCst)
    }
}

impl PartialOrd for AtomicRevision {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for AtomicRevision {
    fn cmp(&self, other: &Self) -> Ordering {
        let (left, right) = (
            self.revision.load(atomic::Ordering::SeqCst),
            other.revision.load(atomic::Ordering::SeqCst),
        );

        left.cmp(&right)
    }
}

impl PartialEq for AtomicRevision {
    fn eq(&self, other: &Self) -> bool {
        let (left, right) = (
            self.revision.load(atomic::Ordering::SeqCst),
            other.revision.load(atomic::Ordering::SeqCst),
        );

        left.eq(&right)
    }
}

impl Eq for AtomicRevision {}
