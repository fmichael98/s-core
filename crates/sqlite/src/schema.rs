//! Schema del database e migrazioni: ogni versione è uno script SQL, applicato una volta sola (PRAGMA user_version).
//! Uno script già pubblicato non si cambia mai: per modificare lo schema se ne aggiunge uno nuovo in fondo.
//!
//! Il file porta il segno dell'app (PRAGMA application_id): il database di un'altra app (o di una versione di prima
//! con schema diverso) non si apre per sbaglio.

use rusqlite::Connection;
use sapp_domain::{Error, Result};

use crate::db_err;

/// "SAPP" (0x53415050): segno dei database di SApp. Ogni app ha il suo (quattro lettere del nome, in esadecimale).
pub const APPLICATION_ID: i64 = 0x5341_5050;

const MIGRATIONS: &[&str] = &[
    // 1: utenti, sessioni (browser e telefoni), impostazioni
    r#"
    CREATE TABLE users (
        id           INTEGER PRIMARY KEY,
        username     TEXT    NOT NULL UNIQUE,
        display_name TEXT    NOT NULL DEFAULT '',
        color        TEXT    NOT NULL,
        role         TEXT    NOT NULL CHECK (role IN ('admin', 'member')),
        pass_hash    TEXT    NOT NULL,
        must_change  INTEGER NOT NULL DEFAULT 0 CHECK (must_change IN (0, 1)),
        disabled     INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
        created      INTEGER NOT NULL,
        last_login   INTEGER
    ) STRICT;

    -- sessioni: solo l'impronta del gettone; `device` è il nome del telefono per l'app Android (NULL: browser)
    CREATE TABLE sessions (
        id         INTEGER PRIMARY KEY,
        key        TEXT    NOT NULL UNIQUE,
        user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created    INTEGER NOT NULL,
        expires    INTEGER NOT NULL,
        last_seen  INTEGER NOT NULL,
        user_agent TEXT    NOT NULL DEFAULT '',
        device     TEXT
    ) STRICT;
    CREATE INDEX sessions_user ON sessions (user_id);

    CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    ) STRICT;
    "#,
    // 2, 3…: le tabelle dell'app, una migrazione per ogni cambio (tabelle STRICT, chiavi esterne con ON DELETE)
];

/// Versione dello schema che questo programma conosce.
pub const VERSION: i64 = MIGRATIONS.len() as i64;

pub fn migrate(conn: &Connection) -> Result<()> {
    let app_id: i64 = conn.query_row("PRAGMA application_id", [], |r| r.get(0)).map_err(db_err)?;
    let tables: i64 = conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'", [], |r| r.get(0)).map_err(db_err)?;
    if app_id != APPLICATION_ID {
        if tables > 0 {
            return Err(Error::internal(
                "questo database non è di SApp (è di un'altra app o di una versione di prima?): nel config usa un file nuovo, es. /var/lib/sapp/sapp.db",
            ));
        }
        conn.execute_batch(&format!("PRAGMA application_id = {APPLICATION_ID};")).map_err(db_err)?;
    }
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(db_err)?;
    if current > VERSION {
        return Err(Error::internal(format!("il database è della versione {current}, questo programma arriva alla {VERSION}: aggiorna SApp")));
    }
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
        let v = i as i64 + 1;
        if let Err(e) = conn.execute_batch(&format!("BEGIN; {sql}; PRAGMA user_version = {v}; COMMIT;")) {
            let _ = conn.execute_batch("ROLLBACK;");
            return Err(Error::internal(format!("migrazione del database alla versione {v}: {e}")));
        }
    }
    Ok(())
}
