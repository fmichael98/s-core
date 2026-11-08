//! Adattatori verso la macchina su cui gira SApp:
//! - [`security`]: impronte delle password (Argon2), gettoni di sessione, password temporanee
//! - [`SystemClock`], [`LinuxHost`]: orologio (ora italiana) e dati della macchina
//! - [`config_file`]: il file di configurazione (TOML)
//! - [`update`]: aggiornamenti dalla pagina (pacchetti firmati, aggiornatore di sistema)
//! - [`apk`]: l'app Android arrivata col pacchetto, da scaricare dal telefono

pub mod apk;
pub mod config_file;
pub mod security;
pub mod update;

use chrono::{Local, LocalResult, TimeZone};
use sapp_app::ports::{Clock, Host};
use sapp_domain::{DateTime, time::Timestamp};

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> Timestamp {
        let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        Timestamp(i64::try_from(secs).unwrap_or(i64::MAX))
    }

    /// Secondo il fuso della macchina: il servizio gira con TZ=Europe/Rome (vedi sapp.service).
    fn local_now(&self) -> DateTime {
        Local::now().naive_local()
    }

    fn instant_of(&self, local: DateTime) -> Timestamp {
        Timestamp(local_to_unix(&Local, local))
    }
}

/// Secondi unix di un'ora locale nel fuso `tz`: nell'ora che si ripete (ottobre) la prima; in quella che manca
/// (marzo) subito dopo il salto.
pub fn local_to_unix<Tz: TimeZone>(tz: &Tz, local: DateTime) -> i64 {
    match tz.from_local_datetime(&local) {
        LocalResult::Single(t) => t.timestamp(),
        LocalResult::Ambiguous(a, b) => a.timestamp().min(b.timestamp()),
        LocalResult::None => {
            let later = local + chrono::TimeDelta::hours(1);
            match tz.from_local_datetime(&later) {
                LocalResult::Single(t) => t.timestamp() - 3600,
                LocalResult::Ambiguous(a, _) => a.timestamp() - 3600,
                LocalResult::None => local.and_utc().timestamp(),
            }
        }
    }
}

pub struct LinuxHost;

impl Host for LinuxHost {
    /// Da /etc/os-release.
    fn os_name(&self) -> String {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|t| t.lines().find_map(|l| l.strip_prefix("PRETTY_NAME=")).map(|v| v.trim_matches('"').to_string()))
            .unwrap_or_default()
    }
    fn hostname(&self) -> String {
        std::fs::read_to_string("/etc/hostname").map(|s| s.trim().to_string()).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{FixedOffset, NaiveDate};

    #[test]
    fn ora_locale() {
        let tz = FixedOffset::east_opt(3600).unwrap();
        let t = NaiveDate::from_ymd_opt(2026, 11, 9).unwrap().and_hms_opt(7, 30, 0).unwrap();
        assert_eq!(local_to_unix(&tz, t), t.and_utc().timestamp() - 3600);
        assert!(SystemClock.now().secs() > 1_700_000_000);
    }
}
