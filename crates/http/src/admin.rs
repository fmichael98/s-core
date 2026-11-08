//! Pannello dell'amministratore: utenti, configurazione, sistema, copia del database, aggiornamenti.

use std::collections::HashMap;

use axum::{
    Json, Router,
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::header,
    response::{IntoResponse, Response},
    routing::{get, post},
};
use sapp_app::config::FieldKind;
use sapp_domain::{
    Error,
    user::{Role, UserId},
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    Shared,
    auth::Me,
    error::{ApiResult, ok, ok_with},
    run, view,
};

pub fn router() -> Router<Shared> {
    Router::new()
        .route("/api/admin/users", get(users).post(create_user))
        .route("/api/admin/users/{id}", post(edit_user).delete(delete_user))
        .route("/api/admin/users/{id}/password", post(reset_password))
        .route("/api/admin/users/{id}/disabled", post(set_disabled))
        .route("/api/admin/config", get(get_config).post(save_config))
        .route("/api/admin/system", get(system_info))
        .route("/api/admin/db", get(db_download))
        .route("/api/update/status", get(update_status))
        .route("/api/update/apply", post(update_apply))
        .route("/api/update/cancel", post(update_cancel))
}

// ---------------------------------------------------------------- utenti

async fn users(State(st): State<Shared>) -> ApiResult<Json<Value>> {
    let list = run(&st, |app| app.list_users()).await?;
    let users: Vec<Value> = list
        .iter()
        .map(|s| {
            let mut v = view::user(&s.user);
            v["sessions"] = json!(s.sessions);
            v["items"] = json!(s.items);
            v
        })
        .collect();
    Ok(Json(json!({ "users": users })))
}

#[derive(Deserialize)]
struct NewUserIn {
    username: String,
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    admin: bool,
}

async fn create_user(State(st): State<Shared>, Json(b): Json<NewUserIn>) -> ApiResult<Json<Value>> {
    let role = if b.admin { Role::Admin } else { Role::Member };
    let (id, username) = run(&st, move |app| app.create_user(&b.username, &b.display_name, role)).await?;
    Ok(ok_with(json!({ "id": id.0, "username": username.as_str() })))
}

#[derive(Deserialize)]
struct EditIn {
    display_name: String,
    color: String,
}

async fn edit_user(State(st): State<Shared>, Path(id): Path<i64>, Json(b): Json<EditIn>) -> ApiResult<Json<Value>> {
    run(&st, move |app| app.edit_user(UserId(id), &b.display_name, &b.color)).await?;
    Ok(ok())
}

#[derive(Deserialize)]
struct PasswordIn {
    password: String,
}

/// Password provvisoria scelta dall'amministratore (l'utente la cambia al primo accesso).
async fn reset_password(State(st): State<Shared>, Path(id): Path<i64>, Json(b): Json<PasswordIn>) -> ApiResult<Json<Value>> {
    run(&st, move |app| app.reset_password(UserId(id), &b.password)).await?;
    Ok(ok())
}

#[derive(Deserialize)]
struct DisabledIn {
    disabled: bool,
}

async fn set_disabled(State(st): State<Shared>, Me(me): Me, Path(id): Path<i64>, Json(b): Json<DisabledIn>) -> ApiResult<Json<Value>> {
    run(&st, move |app| app.set_disabled(me.id, UserId(id), b.disabled)).await?;
    Ok(ok())
}

async fn delete_user(State(st): State<Shared>, Me(me): Me, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    run(&st, move |app| app.delete_user(me.id, UserId(id))).await?;
    Ok(ok())
}

// ---------------------------------------------------------------- configurazione

async fn get_config(State(st): State<Shared>) -> ApiResult<Json<Value>> {
    let v = run(&st, |app| Ok(app.config_view())).await?;
    let items: Vec<Value> = v
        .fields
        .iter()
        .map(|f| {
            let (kind, extra) = match f.field.kind {
                FieldKind::Addr => ("addr", json!({})),
                FieldKind::Host => ("host", json!({})),
                FieldKind::Int(a, b) => ("int", json!({ "min": a, "max": b })),
                FieldKind::ReadOnly => ("ro", json!({})),
            };
            json!({ "key": f.field.key, "group": f.field.group, "label": f.field.label, "help": f.field.help, "kind": kind, "extra": extra,
                    "value": f.value, "running": f.running })
        })
        .collect();
    Ok(Json(json!({ "file": v.path, "helper": v.helper, "items": items, "public_url": v.public_url, "readable": v.readable })))
}

#[derive(Deserialize)]
struct SaveIn {
    values: HashMap<String, String>,
    #[serde(default)]
    password: String,
}

/// Salva la configurazione (serve la password dell'amministratore) e fa riavviare SApp.
async fn save_config(State(st): State<Shared>, Me(me): Me, Json(b): Json<SaveIn>) -> ApiResult<Json<Value>> {
    let who = me.username.to_string();
    // la porta nuova della rete locale deve essere libera su questo server, se no il servizio non ripartirebbe
    let port_free = |c: &sapp_app::config::ServerConfig| {
        std::net::TcpListener::bind(c.bind).map(drop).map_err(|e| Error::invalid(format!("La porta {} non è libera su questo server ({e}).", c.lan_port())))
    };
    let saved = run(&st, move |app| app.save_config(&me, &b.password, &b.values, port_free)).await;
    let saved = match saved {
        Err(e) if e.0.kind == sapp_domain::ErrorKind::Forbidden => {
            tokio::time::sleep(std::time::Duration::from_millis(800)).await;
            return Err(e);
        }
        other => other?,
    };
    if !saved.changed.is_empty() {
        eprintln!("configurazione modificata da {who}: {}", saved.changed.join("; "));
    }
    Ok(ok_with(json!({ "changed": saved.changed.len(), "new_port": saved.new_port })))
}

// ---------------------------------------------------------------- sistema

async fn system_info(State(st): State<Shared>) -> ApiResult<Json<Value>> {
    let s = run(&st, |app| app.system_info()).await?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    Ok(Json(json!({
        "version": s.version, "started": st.boot, "now": now,
        "database": s.database, "db_size": s.db_size, "users": s.users, "sessions": s.sessions,
        "os": s.os, "hostname": s.hostname, "update": view::update_status(&s.update, s.version),
    })))
}

/// Copia coerente del database (anche mentre è in uso).
async fn db_download(State(st): State<Shared>) -> ApiResult<Response> {
    let data = run(&st, |app| app.database_copy()).await?;
    let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    let (y, m, d) = civil_date(secs / 86_400);
    Ok((
        [
            (header::CONTENT_TYPE, "application/vnd.sqlite3".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"sapp-{y}-{m:02}-{d:02}.db\"")),
        ],
        Body::from(data),
    )
        .into_response())
}

/// Giorno del calendario (anno, mese, giorno) dai giorni dal 1970-01-01 (algoritmo di H. Hinnant).
fn civil_date(days: u64) -> (i64, u32, u32) {
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i64::from(m <= 2), m, d)
}

// ---------------------------------------------------------------- aggiornamenti

#[derive(Deserialize)]
struct LogQ {
    from: Option<usize>,
}

async fn update_status(State(st): State<Shared>, Query(q): Query<LogQ>) -> ApiResult<Json<Value>> {
    let current = st.app.version();
    let (status, (log, len)) = run(&st, move |app| Ok((app.update_status(), app.update_log(q.from.unwrap_or(0))))).await?;
    let mut v = view::update_status(&status, current);
    v["log"] = json!(log);
    v["log_len"] = json!(len);
    Ok(Json(v))
}

/// Primo file "file" di un modulo caricato.
async fn upload_file(mp: &mut Multipart) -> ApiResult<Vec<u8>> {
    while let Ok(Some(field)) = mp.next_field().await {
        if field.name() != Some("file") {
            continue;
        }
        let data = field.bytes().await.map_err(|_| Error::invalid("caricamento interrotto o troppo grande"))?;
        return Ok(data.to_vec());
    }
    Err(Error::invalid("nessun file ricevuto").into())
}

pub async fn update_upload(State(st): State<Shared>, mut mp: Multipart) -> ApiResult<Json<Value>> {
    let data = upload_file(&mut mp).await?;
    let current = st.app.version();
    let staged = run(&st, move |app| app.stage_update(data)).await?;
    Ok(ok_with(view::staged(&staged, current)))
}

async fn update_apply(State(st): State<Shared>) -> ApiResult<Json<Value>> {
    run(&st, |app| app.apply_update()).await?;
    Ok(ok())
}

async fn update_cancel(State(st): State<Shared>) -> ApiResult<Json<Value>> {
    run(&st, |app| {
        app.cancel_update();
        Ok(())
    })
    .await?;
    Ok(ok())
}

#[cfg(test)]
mod tests {
    #[test]
    fn date() {
        assert_eq!(super::civil_date(0), (1970, 1, 1));
        assert_eq!(super::civil_date(20_761), (2026, 11, 4));
        assert_eq!(super::civil_date(19_782), (2024, 2, 29));
    }
}
