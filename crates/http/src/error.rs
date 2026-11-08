//! Errori in risposta: `{ "ok": false, "error": "…" }` con il codice HTTP giusto.

use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use sapp_domain::{Error, ErrorKind};
use serde::Serialize;
use serde_json::{Value, json};

pub struct ApiError(pub Error);

impl From<Error> for ApiError {
    fn from(e: Error) -> Self {
        ApiError(e)
    }
}

fn status(kind: ErrorKind) -> StatusCode {
    match kind {
        ErrorKind::Invalid => StatusCode::BAD_REQUEST,
        ErrorKind::Forbidden => StatusCode::FORBIDDEN,
        ErrorKind::NotFound => StatusCode::NOT_FOUND,
        ErrorKind::Conflict => StatusCode::CONFLICT,
        ErrorKind::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
        ErrorKind::Internal => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        if self.0.kind == ErrorKind::Internal {
            eprintln!("errore: {}", self.0.msg);
        }
        (status(self.0.kind), Json(json!({ "ok": false, "error": self.0.msg }))).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

/// Risposta `{ "ok": true, …campi }`.
pub fn ok_with(fields: impl Serialize) -> Json<Value> {
    let mut v = serde_json::to_value(fields).unwrap_or_else(|_| json!({}));
    if let Some(o) = v.as_object_mut() {
        o.insert("ok".into(), json!(true));
    }
    Json(v)
}

/// Risposta `{ "ok": true }`.
pub fn ok() -> Json<Value> {
    Json(json!({ "ok": true }))
}
