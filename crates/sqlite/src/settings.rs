//! Impostazioni del programma (chiave → testo).

use rusqlite::{OptionalExtension, params};
use sapp_app::ports::SettingsRepo;
use sapp_domain::Result;

use crate::{Tx, db_err};

impl SettingsRepo for Tx<'_> {
    fn setting(&self, key: &str) -> Result<Option<String>> {
        self.0.query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| r.get(0)).optional().map_err(db_err)
    }

    fn set_setting(&self, key: &str, value: Option<&str>) -> Result<()> {
        match value {
            Some(v) => {
                self.0.execute("INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value", params![key, v])
            }
            None => self.0.execute("DELETE FROM settings WHERE key = ?1", [key]),
        }
        .map_err(db_err)?;
        Ok(())
    }
}
