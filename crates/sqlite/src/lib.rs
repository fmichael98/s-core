//! Adattatore dei dati: SQLite (un file, modalità WAL) dietro le porte di `sapp-app`.
//!
//! Una connessione sola, protetta da un lucchetto: per una famiglia di utenti basta e avanza, e ogni caso d'uso
//! lavora in una transazione tutta sua.

mod schema;
mod sessions;
mod settings;
mod users;

use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};

use rusqlite::{Connection, OpenFlags};
use sapp_app::ports::{Database, Repos};
use sapp_domain::{Error, Result};

pub struct SqliteDb {
    conn: Mutex<Connection>,
    path: Option<PathBuf>,
}

/// Errore del database → errore interno (con il messaggio per il registro).
pub(crate) fn db_err(e: rusqlite::Error) -> Error {
    Error::internal(format!("database: {e}"))
}

/// Valore salvato che non torna (es. modificato a mano): errore di lettura, non un dato sbagliato.
#[allow(dead_code)] // lo usano le letture dei dati dell'app
pub(crate) fn bad(i: usize, e: Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(i, rusqlite::types::Type::Text, Box::new(e))
}

impl SqliteDb {
    /// Apre (o crea) il database nel file e lo porta all'ultima versione.
    pub fn open(path: &Path) -> Result<SqliteDb> {
        if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
            std::fs::create_dir_all(dir).map_err(|e| Error::internal(format!("cartella {}: {e}", dir.display())))?;
        }
        let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE).map_err(db_err)?;
        conn.pragma_update(None, "journal_mode", "WAL").map_err(db_err)?;
        conn.pragma_update(None, "synchronous", "NORMAL").map_err(db_err)?;
        Self::ready(conn, Some(path.to_path_buf()))
    }

    /// Database in memoria (per le prove).
    pub fn in_memory() -> Result<SqliteDb> {
        Self::ready(Connection::open_in_memory().map_err(db_err)?, None)
    }

    fn ready(conn: Connection, path: Option<PathBuf>) -> Result<SqliteDb> {
        conn.pragma_update(None, "foreign_keys", "ON").map_err(db_err)?;
        conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(db_err)?;
        schema::migrate(&conn)?;
        Ok(SqliteDb { conn: Mutex::new(conn), path })
    }
}

/// I dati dentro una transazione.
pub(crate) struct Tx<'a>(&'a rusqlite::Transaction<'a>);

impl Repos for Tx<'_> {}

impl Database for SqliteDb {
    fn transaction(&self, f: &mut dyn FnMut(&dyn Repos) -> Result<()>) -> Result<()> {
        let mut conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let t = conn.transaction().map_err(db_err)?;
        f(&Tx(&t))?; // in caso di errore la transazione si annulla da sola (drop)
        t.commit().map_err(db_err)
    }

    fn backup_to(&self, path: &Path) -> Result<()> {
        {
            let conn = self.conn.lock().unwrap_or_else(|e| e.into_inner());
            let _ = std::fs::remove_file(path);
            conn.execute("VACUUM INTO ?1", [path.to_string_lossy()]).map_err(db_err)?;
        }
        // dalla copia tolgo i segreti (le sessioni; l'app aggiunge i suoi, es. codici di collegamento) e la
        // ricompatto: niente resti nelle pagine libere
        let copy = Connection::open(path).map_err(db_err)?;
        copy.execute_batch("DELETE FROM sessions; VACUUM;").map_err(db_err)?;
        Ok(())
    }

    fn location(&self) -> String {
        self.path.as_ref().map_or_else(|| "(in memoria)".into(), |p| p.display().to_string())
    }

    fn size_bytes(&self) -> u64 {
        let Some(p) = &self.path else { return 0 };
        ["", "-wal"].iter().filter_map(|s| std::fs::metadata(format!("{}{s}", p.display())).ok()).map(|m| m.len()).sum()
    }
}

#[cfg(test)]
mod tests;
