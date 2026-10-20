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
    http::{header, HeaderValue},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};

/// Versione del guscio (quella di questo crate): utile come `?v=` per la cache del browser.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
pub const SHELL_JS: &str = include_str!("../web/shell.js");
pub const SHELL_CSS: &str = include_str!("../web/shell.css");

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
