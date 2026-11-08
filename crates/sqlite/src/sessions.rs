//! Sessioni del browser e dei telefoni (solo l'impronta del gettone, mai il gettone).

use rusqlite::{OptionalExtension, params};
use sapp_app::ports::{DeviceSession, Session, SessionKey, SessionRepo};
use sapp_domain::{Result, time::Timestamp, user::UserId};

use crate::{Tx, db_err};

/// Il programma con cui si collega (es. il browser): al massimo 200 caratteri.
fn agent(a: &str) -> String {
    a.chars().take(200).collect()
}

impl SessionRepo for Tx<'_> {
    fn insert_session(&self, key: &SessionKey, user: UserId, now: Timestamp, expires: Timestamp, ua: &str, device: Option<&str>) -> Result<()> {
        self.0
            .execute(
                "INSERT INTO sessions (key, user_id, created, expires, last_seen, user_agent, device) VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6)",
                params![key.0, user.0, now.secs(), expires.secs(), agent(ua), device],
            )
            .map_err(db_err)?;
        Ok(())
    }

    fn session(&self, key: &SessionKey) -> Result<Option<Session>> {
        self.0
            .query_row("SELECT user_id, expires, last_seen, device FROM sessions WHERE key = ?1", [&key.0], |r| {
                Ok(Session { user: UserId(r.get(0)?), expires: Timestamp(r.get(1)?), last_seen: Timestamp(r.get(2)?), device: r.get(3)? })
            })
            .optional()
            .map_err(db_err)
    }

    fn touch_session(&self, key: &SessionKey, at: Timestamp, ua: &str, expires: Option<Timestamp>) -> Result<()> {
        self.0
            .execute(
                "UPDATE sessions SET last_seen = ?2, user_agent = ?3, expires = COALESCE(?4, expires) WHERE key = ?1",
                params![key.0, at.secs(), agent(ua), expires.map(|e| e.secs())],
            )
            .map_err(db_err)?;
        Ok(())
    }

    fn delete_session(&self, key: &SessionKey) -> Result<()> {
        self.0.execute("DELETE FROM sessions WHERE key = ?1", [&key.0]).map_err(db_err)?;
        Ok(())
    }

    fn delete_sessions_of(&self, user: UserId, keep: Option<&SessionKey>) -> Result<()> {
        let keep = keep.map(|k| k.0.as_str()).unwrap_or("");
        self.0.execute("DELETE FROM sessions WHERE user_id = ?1 AND key <> ?2", params![user.0, keep]).map_err(db_err)?;
        Ok(())
    }

    fn delete_expired_sessions(&self, now: Timestamp) -> Result<usize> {
        self.0.execute("DELETE FROM sessions WHERE expires <= ?1", [now.secs()]).map_err(db_err)
    }

    fn sessions_per_user(&self, now: Timestamp) -> Result<Vec<(UserId, usize)>> {
        let mut st = self.0.prepare("SELECT user_id, COUNT(*) FROM sessions WHERE expires > ?1 GROUP BY user_id").map_err(db_err)?;
        st.query_map([now.secs()], |r| Ok((UserId(r.get(0)?), r.get::<_, i64>(1)? as usize))).map_err(db_err)?.collect::<rusqlite::Result<_>>().map_err(db_err)
    }

    fn devices_of(&self, user: UserId, now: Timestamp) -> Result<Vec<DeviceSession>> {
        let mut st = self
            .0
            .prepare("SELECT id, device, created, last_seen, user_agent FROM sessions WHERE user_id = ?1 AND device IS NOT NULL AND expires > ?2 ORDER BY last_seen DESC")
            .map_err(db_err)?;
        st.query_map(params![user.0, now.secs()], |r| {
            Ok(DeviceSession { id: r.get(0)?, name: r.get(1)?, created: Timestamp(r.get(2)?), last_seen: Timestamp(r.get(3)?), agent: r.get(4)? })
        })
        .map_err(db_err)?
        .collect::<rusqlite::Result<_>>()
        .map_err(db_err)
    }

    fn delete_device(&self, user: UserId, id: i64) -> Result<bool> {
        Ok(self.0.execute("DELETE FROM sessions WHERE id = ?1 AND user_id = ?2 AND device IS NOT NULL", params![id, user.0]).map_err(db_err)? > 0)
    }
}
