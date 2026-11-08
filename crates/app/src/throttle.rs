//! Freno ai tentativi di accesso sbagliati, per indirizzo IP.

use std::{collections::HashMap, net::IpAddr};

use sapp_domain::time::{Duration, Timestamp};

#[derive(Default, Debug)]
pub struct LoginThrottle {
    /// tentativi sbagliati di fila e quando l'ultimo
    fails: HashMap<IpAddr, (u32, Timestamp)>,
}

impl LoginThrottle {
    /// Bloccato: `max` tentativi sbagliati, l'ultimo da meno di `lock`.
    pub fn is_locked(&mut self, ip: IpAddr, now: Timestamp, max: u32, lock: Duration) -> bool {
        self.forget_old(now, lock);
        self.fails.get(&ip).is_some_and(|(n, _)| *n >= max)
    }

    /// Un tentativo sbagliato in più; quanti di fila.
    pub fn fail(&mut self, ip: IpAddr, now: Timestamp) -> u32 {
        let e = self.fails.entry(ip).or_insert((0, now));
        e.0 += 1;
        e.1 = now;
        e.0
    }

    pub fn clear(&mut self, ip: IpAddr) {
        self.fails.remove(&ip);
    }

    /// Dopo il tempo di blocco dall'ultimo errore si riparte da zero.
    fn forget_old(&mut self, now: Timestamp, lock: Duration) {
        self.fails.retain(|_, (_, last)| now.since(*last) < lock);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocco_e_sblocco() {
        let ip: IpAddr = "10.0.0.5".parse().unwrap();
        let other: IpAddr = "10.0.0.6".parse().unwrap();
        let lock = Duration::minutes(15);
        let mut t = LoginThrottle::default();
        for i in 1..=5 {
            assert!(!t.is_locked(ip, Timestamp(i), 5, lock));
            t.fail(ip, Timestamp(i));
        }
        assert!(t.is_locked(ip, Timestamp(10), 5, lock));
        assert!(!t.is_locked(other, Timestamp(10), 5, lock), "solo quell'IP");
        assert!(!t.is_locked(ip, Timestamp(5 + 15 * 60), 5, lock), "passato il blocco");
        t.fail(ip, Timestamp(2_000));
        t.clear(ip);
        assert!(!t.is_locked(ip, Timestamp(2_001), 1, lock));
    }
}
