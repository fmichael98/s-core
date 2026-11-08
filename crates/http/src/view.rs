//! Come i dati diventano JSON per la pagina e per l'app (i tipi del dominio non sanno niente di formati di scambio).
//! Una funzione per tipo; quelle dei dati dell'app vanno accanto.

use sapp_app::ports::{ApkInfo, DeviceSession, Staged, UpdateStatus};
use sapp_domain::user::User;
use serde_json::{Value, json};

pub fn user(u: &User) -> Value {
    json!({
        "id": u.id.0,
        "username": u.username.as_str(),
        "display_name": u.display_name.as_str(),
        "name": u.shown_name(),
        "color": u.color.as_str(),
        "role": u.role.as_str(),
        "must_change": u.must_change,
        "disabled": u.disabled,
        "created": u.created.secs(),
        "last_login": u.last_login.map(|t| t.secs()),
    })
}

/// Un'altra persona, come la vedono gli utenti (senza dati di accesso): per condivisioni e proprietari.
#[allow(dead_code)] // la usano le viste dei dati condivisi dell'app
pub fn person(u: &User) -> Value {
    json!({ "id": u.id.0, "username": u.username.as_str(), "name": u.shown_name(), "color": u.color.as_str() })
}

pub fn update_status(s: &UpdateStatus, current: &str) -> Value {
    json!({
        "available": s.available, "helper": s.helper, "staged": s.staged, "pending": s.pending,
        "result": s.result, "signing": s.signing, "current": current,
    })
}

pub fn staged(s: &Staged, current: &str) -> Value {
    json!({ "version": s.version, "current": current, "size": s.size, "signed": s.signed, "older": s.older })
}

pub fn device(d: &DeviceSession) -> Value {
    json!({ "id": d.id, "name": d.name, "created": d.created.secs(), "last_seen": d.last_seen.secs(), "agent": d.agent })
}

pub fn apk(a: &Option<ApkInfo>) -> Value {
    match a {
        Some(a) => json!({ "available": true, "version": a.version, "size": a.size, "file_name": a.file_name }),
        None => json!({ "available": false }),
    }
}
