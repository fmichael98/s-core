//! Utenti.

use rusqlite::{OptionalExtension, Row, params};
use sapp_app::ports::{NewUser, UserRepo};
use sapp_domain::{
    Error, Result,
    time::Timestamp,
    user::{AvatarColor, DisplayName, Role, User, UserId, Username},
};

use crate::{Tx, db_err};

const COLS: &str = "id, username, display_name, color, role, must_change, disabled, created, last_login";

/// Riga → utente. Un valore che non torna (es. modificato a mano) è un errore, non un utente sbagliato.
fn user_from(row: &Row<'_>) -> rusqlite::Result<User> {
    let bad = |i: usize, e: Error| rusqlite::Error::FromSqlConversionFailure(i, rusqlite::types::Type::Text, Box::new(e));
    Ok(User {
        id: UserId(row.get(0)?),
        username: Username::parse(&row.get::<_, String>(1)?).map_err(|e| bad(1, e))?,
        display_name: DisplayName::parse(&row.get::<_, String>(2)?).map_err(|e| bad(2, e))?,
        color: AvatarColor::parse(&row.get::<_, String>(3)?).map_err(|e| bad(3, e))?,
        role: Role::parse(&row.get::<_, String>(4)?).map_err(|e| bad(4, e))?,
        must_change: row.get(5)?,
        disabled: row.get(6)?,
        created: Timestamp(row.get(7)?),
        last_login: row.get::<_, Option<i64>>(8)?.map(Timestamp),
    })
}

impl Tx<'_> {
    /// Esegue una modifica su un utente che deve esistere.
    fn update_user(&self, sql: &str, params: impl rusqlite::Params) -> Result<()> {
        match self.0.execute(sql, params).map_err(db_err)? {
            0 => Err(Error::not_found("utente non trovato")),
            _ => Ok(()),
        }
    }
}

impl UserRepo for Tx<'_> {
    fn insert_user(&self, u: &NewUser) -> Result<UserId> {
        let r = self.0.execute(
            "INSERT INTO users (username, display_name, color, role, pass_hash, must_change, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![u.username.as_str(), u.display_name.as_str(), u.color.as_str(), u.role.as_str(), u.pass_hash, u.must_change, u.created.secs()],
        );
        match r {
            Ok(_) => Ok(UserId(self.0.last_insert_rowid())),
            Err(rusqlite::Error::SqliteFailure(e, _)) if e.code == rusqlite::ErrorCode::ConstraintViolation => {
                Err(Error::conflict(format!("Il nome utente «{}» esiste già.", u.username)))
            }
            Err(e) => Err(db_err(e)),
        }
    }

    fn user(&self, id: UserId) -> Result<Option<User>> {
        self.0.query_row(&format!("SELECT {COLS} FROM users WHERE id = ?1"), [id.0], user_from).optional().map_err(db_err)
    }

    fn user_by_name(&self, name: &Username) -> Result<Option<User>> {
        self.0.query_row(&format!("SELECT {COLS} FROM users WHERE username = ?1"), [name.as_str()], user_from).optional().map_err(db_err)
    }

    fn users(&self) -> Result<Vec<User>> {
        let mut st = self.0.prepare(&format!("SELECT {COLS} FROM users ORDER BY username")).map_err(db_err)?;
        st.query_map([], user_from).map_err(db_err)?.collect::<rusqlite::Result<_>>().map_err(db_err)
    }

    fn password_hash(&self, id: UserId) -> Result<Option<String>> {
        self.0.query_row("SELECT pass_hash FROM users WHERE id = ?1", [id.0], |r| r.get(0)).optional().map_err(db_err)
    }

    fn set_password(&self, id: UserId, hash: &str, must_change: bool) -> Result<()> {
        self.update_user("UPDATE users SET pass_hash = ?2, must_change = ?3 WHERE id = ?1", params![id.0, hash, must_change])
    }

    fn set_profile(&self, id: UserId, name: &DisplayName, color: AvatarColor) -> Result<()> {
        self.update_user("UPDATE users SET display_name = ?2, color = ?3 WHERE id = ?1", params![id.0, name.as_str(), color.as_str()])
    }

    fn set_disabled(&self, id: UserId, disabled: bool) -> Result<()> {
        self.update_user("UPDATE users SET disabled = ?2 WHERE id = ?1", params![id.0, disabled])
    }

    fn set_last_login(&self, id: UserId, at: Timestamp) -> Result<()> {
        self.update_user("UPDATE users SET last_login = ?2 WHERE id = ?1", params![id.0, at.secs()])
    }

    fn delete_user(&self, id: UserId) -> Result<()> {
        self.update_user("DELETE FROM users WHERE id = ?1", [id.0])
    }
}
