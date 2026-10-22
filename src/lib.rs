//! s-core — guscio comune delle app S*.
//!
//! Tappa 1: i file web condivisi (`shell.js`, `shell.css`), incorporati nel programma e serviti da `routes()`.
//! L'app li include nella sua pagina, prima dei propri `app.js` / `app.css`:
//!
//! ```html
//! <link rel="stylesheet" href="/shell.css?v=0.1.0">
//! <link rel="stylesheet" href="/app.css">
//! <script>window.SHELL = { name: 'SHealth', csrf: 'X-SHealth', ua: 'SHealthApp' };</script>
//! <script src="/shell.js?v=0.1.0"></script>
//! <script src="/app.js"></script>
//! ```
//!
//! e nel router axum: `.merge(s_core::routes())`.

use axum::{
    extract::Path,
    http::{header, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};

/// Versione del guscio (quella di questo crate): utile come `?v=` per la cache del browser.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const SHELL_JS: &str = include_str!("../web/shell.js");
pub const SHELL_CSS: &str = include_str!("../web/shell.css");
pub const PAGE_JS: &str = include_str!("../web/page.js");

fn asset(body: &'static str, mime: &'static str) -> Response {
    (
        [
            (header::CONTENT_TYPE, HeaderValue::from_static(mime)),
            (header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=86400")),
        ],
        body,
    )
        .into_response()
}

/// Le rotte `/shell.js` e `/shell.css`. Vanno lasciate pubbliche (servono anche alla pagina di accesso, se la usa).
pub fn routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/shell.js", get(|| async { asset(SHELL_JS, "application/javascript; charset=utf-8") }))
        .route("/shell.css", get(|| async { asset(SHELL_CSS, "text/css; charset=utf-8") }))
        .route("/page.js", get(|| async { asset(PAGE_JS, "application/javascript; charset=utf-8") }))
}

/// Il blocco `<head>`/`<script>` da mettere nella pagina: fogli di stile e script del guscio con la versione per la cache.
pub fn head_tags(name: &str, csrf: &str, ua: &str) -> String {
    format!(
        r#"<link rel="stylesheet" href="/shell.css?v={v}">
<script>window.SHELL={{name:"{name}",csrf:"{csrf}",ua:"{ua}"}};</script>
<script src="/shell.js?v={v}" defer></script>"#,
        v = VERSION
    )
}

// ---------------------------------------------------------------- "altre app": catalogo pubblicato da SMonitor
/// Cartella del catalogo (SMonitor ci mette apps.json e gli APK attuali).
pub const APPS_DIR: &str = "/usr/local/share/s-apps/current";

fn apps_dir() -> std::path::PathBuf {
    std::env::var("S_APPS_DIR").map(std::path::PathBuf::from).unwrap_or_else(|_| std::path::PathBuf::from(APPS_DIR))
}

/// Catalogo delle altre app (JSON di SMonitor), per le Impostazioni; `[]` se non è stato pubblicato.
pub async fn apps_list() -> Response {
    let body = std::fs::read_to_string(apps_dir().join("apps.json")).unwrap_or_else(|_| "[]".into());
    ([(header::CONTENT_TYPE, HeaderValue::from_static("application/json")), (header::CACHE_CONTROL, HeaderValue::from_static("no-store"))], body).into_response()
}

/// APK di un'altra app, dal catalogo.
pub async fn apps_apk(Path(file): Path<String>) -> Response {
    let id = file.strip_suffix(".apk").unwrap_or(&file);
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return StatusCode::NOT_FOUND.into_response();
    }
    // nome del file: dal catalogo (es. "SMoney 1.25.apk")
    let name = std::fs::read_to_string(apps_dir().join("apps.json")).ok()
        .and_then(|j| {
            let v: serde_json_lite::Value = serde_json_lite::parse(&j)?;
            v.find(id).map(|(n, ver)| format!("{n} {ver}.apk"))
        })
        .unwrap_or_else(|| format!("{id}.apk"));
    match tokio::fs::read(apps_dir().join(format!("{id}.apk"))).await {
        Ok(data) => (
            [
                (header::CONTENT_TYPE, HeaderValue::from_static("application/vnd.android.package-archive")),
                (header::CONTENT_DISPOSITION, HeaderValue::from_str(&format!("attachment; filename=\"{}\"", name.replace('"', ""))).unwrap_or(HeaderValue::from_static("attachment"))),
                (header::CACHE_CONTROL, HeaderValue::from_static("no-store")),
            ],
            data,
        )
            .into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Le rotte `/api/apps` e `/api/apps/{id}.apk`: vanno dietro l'accesso dell'app (sono per i suoi utenti).
pub fn apps_routes<S: Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new().route("/api/apps", get(apps_list)).route("/api/apps/{file}", get(apps_apk))
}

/// Lettura minima del catalogo (niente dipendenze): nome e versione dell'app con quell'id.
mod serde_json_lite {
    pub struct Value(String);
    pub fn parse(s: &str) -> Option<Value> {
        Some(Value(s.to_string()))
    }
    impl Value {
        /// (name, version) dell'oggetto con "id":"<id>"
        pub fn find(&self, id: &str) -> Option<(String, String)> {
            let key = format!("\"id\":\"{id}\"");
            let i = self.0.find(&key)?;
            let obj = &self.0[i..self.0[i..].find('}')? + i];
            let get = |k: &str| -> Option<String> {
                let j = obj.find(&format!("\"{k}\":\""))? + k.len() + 4;
                let e = obj[j..].find('"')? + j;
                Some(obj[j..e].to_string())
            };
            Some((get("name")?, get("version").unwrap_or_default()))
        }
    }
}
