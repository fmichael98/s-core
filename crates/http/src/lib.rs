//! Adattatore web (axum): pagine, API JSON (per la pagina e per l'app Android) e aggiornamento dal vivo.
//!
//! Qui non ci sono regole: ogni richiesta diventa una chiamata a un caso d'uso di [`App`] (eseguito fuori dai thread
//! del server web, perché database e verifica delle password sono sincroni) e il risultato diventa JSON.

mod admin;
mod assets;
mod auth;
mod changelog;
mod error;
mod live;
mod phone;
mod view;

use std::{collections::HashMap, net::SocketAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Query, State},
    http::header,
    middleware,
    response::IntoResponse,
    routing::{get, post},
};
use sapp_app::App;
use sapp_domain::Error;
use serde_json::{Value, json};

pub use auth::{COOKIE, CSRF_HEADER};
use error::ApiResult;
use live::Notifier;

/// Stato condiviso del server web.
pub struct AppState {
    pub app: Arc<App>,
    pub live: Notifier,
    /// avvio del programma (secondi unix): le pagine capiscono quando è ripartito
    pub boot: i64,
}

pub type Shared = Arc<AppState>;

impl AppState {
    pub fn new(app: Arc<App>, boot: i64) -> Shared {
        Arc::new(AppState { app, live: Notifier::default(), boot })
    }

    /// I dati sono cambiati senza una richiesta (es. un lavoro periodico): le pagine aperte rileggono.
    pub fn changed(&self) {
        self.live.changed();
    }
}

/// Esegue un caso d'uso fuori dai thread del server web.
pub(crate) async fn run<T: Send + 'static>(st: &Shared, f: impl FnOnce(&App) -> sapp_domain::Result<T> + Send + 'static) -> ApiResult<T> {
    let app = st.app.clone();
    match tokio::task::spawn_blocking(move || f(&app)).await {
        Ok(r) => r.map_err(Into::into),
        Err(e) => Err(Error::internal(format!("operazione interrotta: {e}")).into()),
    }
}

/// Tutte le rotte. Il controllo di accesso ([`auth::gate`]) passa da ogni richiesta.
pub fn router(st: Shared) -> Router {
    Router::new()
        // pubbliche
        .route("/login", get(auth::login_page).post(auth::login_submit))
        .route("/api/version", get(version))
        .route("/api/changelog", get(changelog))
        .route("/api/device/login", post(auth::device_login))
        // qualunque utente collegato
        .route("/logout", post(auth::logout))
        .route("/password", get(assets::password))
        .route("/api/password", post(auth::change_password))
        .route("/api/me", get(auth::me))
        .route("/api/profile", post(auth::update_profile))
        .route("/api/live", get(live::stream))
        // utenti
        .route("/", get(assets::index))
        .merge(phone::router())
        // qui le rotte dell'app, un modulo per argomento: .merge(veicoli::router())
        // amministratore
        .route("/admin", get(assets::admin))
        .merge(admin::router())
        .route("/api/update/upload", post(admin::update_upload).layer(DefaultBodyLimit::max(120 * 1024 * 1024)))
        // script, stili e icone
        .fallback(assets::serve)
        .layer(middleware::from_fn_with_state(st.clone(), live::notify_on_change))
        .layer(middleware::from_fn(auth::csrf))
        .layer(middleware::from_fn_with_state(st.clone(), auth::gate))
        .with_state(st)
}

/// Il servizio completo, con l'indirizzo di chi si collega (per il freno ai tentativi di accesso).
pub fn service(st: Shared) -> axum::extract::connect_info::IntoMakeServiceWithConnectInfo<Router, SocketAddr> {
    router(st).into_make_service_with_connect_info::<SocketAddr>()
}

/// Pubblico: versione in esecuzione (le pagine si ricaricano da sole quando cambia; install.sh verifica che
/// risponda proprio SApp; l'app Android controlla di parlare con SApp) e indirizzo https.
async fn version(State(st): State<Shared>) -> Json<Value> {
    Json(json!({ "app": "sapp", "version": st.app.version(), "boot": st.boot, "https": st.app.config().public_url() }))
}

/// Pubblico: novità per versione (con `?after=X.Y.Z` solo quelle successive).
async fn changelog(Query(q): Query<HashMap<String, String>>) -> impl IntoResponse {
    ([(header::CACHE_CONTROL, "no-cache")], Json(changelog::releases(q.get("after").map(String::as_str))))
}

#[cfg(test)]
mod tests;
