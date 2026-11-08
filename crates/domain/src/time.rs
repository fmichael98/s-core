//! Istanti nel tempo (secondi unix) e durate.

/// Istante in secondi unix (UTC).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Timestamp(pub i64);

impl Timestamp {
    pub const fn secs(self) -> i64 {
        self.0
    }
    /// Questo istante più `d`.
    pub const fn plus(self, d: Duration) -> Timestamp {
        Timestamp(self.0.saturating_add(d.0))
    }
    /// Questo istante meno `d`.
    pub const fn minus(self, d: Duration) -> Timestamp {
        Timestamp(self.0.saturating_sub(d.0))
    }
    /// Quanto tempo è passato da `earlier` (zero se `earlier` è dopo).
    pub const fn since(self, earlier: Timestamp) -> Duration {
        let d = self.0 - earlier.0;
        Duration(if d > 0 { d } else { 0 })
    }
}

/// Durata in secondi (mai negativa).
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Duration(i64);

impl Duration {
    pub const ZERO: Duration = Duration(0);
    pub const fn seconds(s: u64) -> Duration {
        Duration(if s > i64::MAX as u64 { i64::MAX } else { s as i64 })
    }
    pub const fn minutes(m: u64) -> Duration {
        Duration::seconds(m.saturating_mul(60))
    }
    pub const fn days(d: u64) -> Duration {
        Duration::seconds(d.saturating_mul(86_400))
    }
    pub const fn as_secs(self) -> i64 {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conti() {
        let t = Timestamp(1_000);
        assert_eq!(t.plus(Duration::minutes(2)), Timestamp(1_120));
        assert_eq!(t.minus(Duration::seconds(400)), Timestamp(600));
        assert_eq!(Timestamp(1_120).since(t), Duration::seconds(120));
        assert_eq!(t.since(Timestamp(5_000)), Duration::ZERO);
        assert_eq!(Duration::days(1).as_secs(), 86_400);
    }
}
