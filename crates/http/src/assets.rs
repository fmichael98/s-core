//! Pagina web incorporata nel programma: tutto ciò che Vite ha prodotto in frontend/dist (elenco preparato da
//! build.rs).

use axum::{
    http::{HeaderValue, StatusCode, Uri, header},
    response::{Html, IntoResponse, Response},
};

struct Asset {
    path: &'static str,
    mime: &'static str,
    cache: &'static str,
    body: &'static [u8],
}

/// script e stili con l'impronta nel nome: non cambiano mai
const IMMUTABLE: &str = "public, max-age=31536000, immutable";
/// sempre ricontrollati (cambiano a ogni versione)
const FRESH: &str = "no-cache";
const DAY: &str = "max-age=86400";

include!(concat!(env!("OUT_DIR"), "/assets.rs"));

/// File statico (pubblico: serve anche alla pagina di accesso).
pub fn is_asset(path: &str) -> bool {
    ASSETS.iter().any(|a| a.path == path)
}

/// Serve un file statico (rotta di riserva del router).
pub async fn serve(uri: Uri) -> Response {
    match ASSETS.iter().find(|a| a.path == uri.path()) {
        Some(a) => {
            ([(header::CONTENT_TYPE, HeaderValue::from_static(a.mime)), (header::CACHE_CONTROL, HeaderValue::from_static(a.cache))], a.body).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Pagina HTML: sempre ricontrollata, così dopo un aggiornamento il browser prende subito script e stili nuovi.
fn page(html: &'static str) -> Response {
    ([(header::CACHE_CONTROL, HeaderValue::from_static(FRESH))], Html(html)).into_response()
}

pub async fn index() -> Response {
    page(INDEX)
}
pub async fn admin() -> Response {
    page(ADMIN)
}
pub async fn password() -> Response {
    page(PASSWORD)
}
pub fn login() -> Response {
    page(LOGIN)
}
