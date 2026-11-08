//! Telefoni collegati con l'app Android e l'app da scaricare (l'APK arriva col pacchetto del server).

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::header,
    response::{IntoResponse, Response},
    routing::{delete, get, post},
};
use serde_json::{Value, json};

use crate::{
    Shared,
    auth::{self, Me},
    error::{ApiResult, ok},
    run, view,
};

pub fn router() -> Router<Shared> {
    Router::new()
        .route("/api/devices", get(devices))
        .route("/api/devices/{id}", delete(remove_device))
        .route("/api/device/logout", post(auth::device_logout))
        .route("/api/app", get(app_info))
        .route("/app/sapp.apk", get(apk))
}

async fn devices(State(st): State<Shared>, Me(me): Me) -> ApiResult<Json<Value>> {
    let list = run(&st, move |app| app.devices(&me)).await?;
    let apk = st.app.apk_info();
    Ok(Json(json!({ "devices": list.iter().map(view::device).collect::<Vec<_>>(), "app": view::apk(&apk) })))
}

async fn remove_device(State(st): State<Shared>, Me(me): Me, Path(id): Path<i64>) -> ApiResult<Json<Value>> {
    run(&st, move |app| app.remove_device(&me, id)).await?;
    Ok(ok())
}

async fn app_info(State(st): State<Shared>) -> Json<Value> {
    Json(view::apk(&st.app.apk_info()))
}

/// L'APK dell'app Android (arriva col pacchetto del server).
async fn apk(State(st): State<Shared>) -> ApiResult<Response> {
    let name = st.app.apk_info().map(|a| a.file_name).unwrap_or_else(|| "SApp.apk".into());
    let data = run(&st, |app| app.apk_bytes()).await?;
    Ok((
        [
            (header::CONTENT_TYPE, "application/vnd.android.package-archive".to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\"")),
            (header::CACHE_CONTROL, "no-cache".to_string()),
        ],
        Body::from(data),
    )
        .into_response())
}
