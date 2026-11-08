//! Prove dell'API con gli adattatori veri (SQLite in memoria, cartelle temporanee), richiesta per richiesta.

use std::{net::SocketAddr, path::PathBuf, sync::Arc};

use axum::{
    Router,
    body::{Body, to_bytes},
    extract::connect_info::MockConnectInfo,
    http::{Request, StatusCode, header},
};
use sapp_app::{App, Ports, config::ServerConfig, ports::Security};
use sapp_sqlite::SqliteDb;
use sapp_system::{LinuxHost, SystemClock, apk::ApkFolder, config_file::TomlConfigFile, security::Argon2Security, update::UpdateArea};
use serde_json::{Value, json};
use tower::ServiceExt;

use crate::{AppState, COOKIE, CSRF_HEADER, router};

fn temp_dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("sapp-http-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    d
}

fn server(name: &str) -> Router {
    let cfg = ServerConfig { password_hash: Argon2Security.hash_password("segreta123"), ..ServerConfig::default() };
    let dir = temp_dir(name);
    std::fs::create_dir_all(dir.join("app")).unwrap();
    std::fs::write(dir.join("app").join("SApp 1.0.apk"), b"PK-finto").unwrap();
    let ports = Ports {
        db: Arc::new(SqliteDb::in_memory().unwrap()),
        security: Arc::new(Argon2Security),
        clock: Arc::new(SystemClock),
        host: Arc::new(LinuxHost),
        config_file: Arc::new(TomlConfigFile::new(dir.join("config.toml").to_string_lossy())),
        updater: Arc::new(UpdateArea::new(dir.join("update"), "1.0.0")),
        apk: Arc::new(ApkFolder::new(dir.join("app"))),
    };
    let app = Arc::new(App::new(ports, cfg, "1.0.0"));
    app.bootstrap_admin(&[]).unwrap();
    router(AppState::new(app, 0)).layer(MockConnectInfo(SocketAddr::from(([10, 0, 0, 7], 50_000))))
}

struct Res {
    status: StatusCode,
    location: Option<String>,
    json: Value,
    bytes: Vec<u8>,
}

enum Auth<'a> {
    None,
    Cookie(&'a str),
    Bearer(&'a str),
}

async fn call(app: &Router, method: &str, path: &str, auth: Auth<'_>, body: Option<Value>, csrf: bool) -> Res {
    let mut req = Request::builder().method(method).uri(path);
    match auth {
        Auth::Cookie(c) => req = req.header(header::COOKIE, format!("{COOKIE}={c}")),
        Auth::Bearer(t) => req = req.header(header::AUTHORIZATION, format!("Bearer {t}")),
        Auth::None => {}
    }
    if csrf {
        req = req.header(CSRF_HEADER, "1");
    }
    let req = match body {
        Some(b) => req.header(header::CONTENT_TYPE, "application/json").body(Body::from(b.to_string())).unwrap(),
        None => req.body(Body::empty()).unwrap(),
    };
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    let location = res.headers().get(header::LOCATION).map(|v| v.to_str().unwrap().to_string());
    let bytes = to_bytes(res.into_body(), 10 << 20).await.unwrap().to_vec();
    Res { status, location, json: serde_json::from_slice(&bytes).unwrap_or(Value::Null), bytes }
}

async fn login(app: &Router, user: &str, pass: &str) -> String {
    let req = Request::builder()
        .method("POST")
        .uri("/login")
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(Body::from(format!("username={user}&password={pass}")))
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    assert_eq!(res.status(), StatusCode::SEE_OTHER, "accesso di {user}");
    res.headers().get(header::SET_COOKIE).unwrap().to_str().unwrap().split(';').next().unwrap().split_once('=').unwrap().1.to_string()
}

/// L'amministratore crea un utente che cambia la password: il suo cookie.
async fn member(app: &Router, admin: &str, name: &str) -> String {
    let r = call(app, "POST", "/api/admin/users", Auth::Cookie(admin), Some(json!({ "username": name })), true).await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.json);
    let c = login(app, name, name).await;
    let r = call(app, "POST", "/api/password", Auth::Cookie(&c), Some(json!({ "current": name, "new": "nuovissima1" })), true).await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.json);
    c
}

#[tokio::test]
async fn pubbliche_e_permessi() {
    let app = server("permessi");
    let v = call(&app, "GET", "/api/version", Auth::None, None, false).await;
    assert_eq!(v.json["app"], "sapp");
    assert!(call(&app, "GET", "/api/changelog", Auth::None, None, false).await.json.as_array().is_some_and(|a| !a.is_empty()));
    assert_eq!(call(&app, "GET", "/", Auth::None, None, false).await.location.as_deref(), Some("/login"));
    assert_eq!(call(&app, "GET", "/api/me", Auth::None, None, false).await.status, StatusCode::UNAUTHORIZED);
    let admin = login(&app, "admin", "segreta123").await;
    // l'amministratore gestisce solo il server, gli utenti solo l'app
    assert_eq!(call(&app, "GET", "/api/devices", Auth::Cookie(&admin), None, false).await.status, StatusCode::FORBIDDEN);
    assert_eq!(call(&app, "GET", "/api/admin/system", Auth::Cookie(&admin), None, false).await.status, StatusCode::OK);
    let anna = member(&app, &admin, "anna").await;
    assert_eq!(call(&app, "GET", "/api/admin/users", Auth::Cookie(&anna), None, false).await.status, StatusCode::FORBIDDEN);
    let me = call(&app, "GET", "/api/me", Auth::Cookie(&anna), None, false).await;
    assert_eq!(me.json["username"], "anna", "{:?}", me.json);
    // senza intestazione anti-CSRF niente modifiche dal browser
    let profile = json!({ "display_name": "Anna", "color": "rose" });
    let r = call(&app, "POST", "/api/profile", Auth::Cookie(&anna), Some(profile.clone()), false).await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    let r = call(&app, "POST", "/api/profile", Auth::Cookie(&anna), Some(profile), true).await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.json);
}

#[tokio::test]
async fn amministratore_e_utenti() {
    let app = server("utenti");
    let admin = login(&app, "admin", "segreta123").await;
    let _ = member(&app, &admin, "bruno").await;
    let users = call(&app, "GET", "/api/admin/users", Auth::Cookie(&admin), None, false).await;
    let names: Vec<_> = users.json["users"].as_array().unwrap().iter().map(|u| u["username"].as_str().unwrap().to_string()).collect();
    assert_eq!(names, ["admin", "bruno"]);
    // nome già usato
    let r = call(&app, "POST", "/api/admin/users", Auth::Cookie(&admin), Some(json!({ "username": "bruno" })), true).await;
    assert_eq!(r.status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn app_android() {
    let app = server("android");
    let admin = login(&app, "admin", "segreta123").await;
    let _ = member(&app, &admin, "michael").await;
    // l'amministratore no
    let r = call(&app, "POST", "/api/device/login", Auth::None, Some(json!({ "username": "admin", "password": "segreta123", "device": "Pixel" })), false).await;
    assert_eq!(r.status, StatusCode::FORBIDDEN);
    let r =
        call(&app, "POST", "/api/device/login", Auth::None, Some(json!({ "username": "michael", "password": "sbagliata", "device": "Pixel" })), false).await;
    assert_eq!(r.status, StatusCode::UNAUTHORIZED);
    let r = call(&app, "POST", "/api/device/login", Auth::None, Some(json!({ "username": "michael", "password": "nuovissima1", "device": "Pixel 8" })), false)
        .await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.json);
    let token = r.json["token"].as_str().unwrap().to_string();
    // dal telefono le modifiche passano anche senza l'intestazione anti-CSRF (non c'è cookie)
    let r = call(&app, "POST", "/api/profile", Auth::Bearer(&token), Some(json!({ "display_name": "Michael", "color": "blue" })), false).await;
    assert_eq!(r.status, StatusCode::OK, "{:?}", r.json);
    // lo stesso gettone come cookie apre la pagina (la WebView dell'app)
    assert_eq!(call(&app, "GET", "/", Auth::Cookie(&token), None, false).await.status, StatusCode::OK);
    let apk = call(&app, "GET", "/app/sapp.apk", Auth::Bearer(&token), None, false).await;
    assert_eq!((apk.status, apk.bytes.as_slice()), (StatusCode::OK, b"PK-finto".as_slice()));
    // l'app si scarica anche senza essere entrati (dalla pagina d'accesso)
    let apk = call(&app, "GET", "/app/sapp.apk", Auth::None, None, false).await;
    assert_eq!(apk.status, StatusCode::OK);
    assert_eq!(call(&app, "GET", "/api/app", Auth::None, None, false).await.json["version"], "1.0");
    let devs = call(&app, "GET", "/api/devices", Auth::Bearer(&token), None, false).await;
    assert_eq!(devs.json["devices"][0]["name"], "Pixel 8");
    let r = call(&app, "POST", "/api/device/logout", Auth::Bearer(&token), None, false).await;
    assert_eq!(r.status, StatusCode::OK);
    assert_eq!(call(&app, "GET", "/api/devices", Auth::Bearer(&token), None, false).await.status, StatusCode::UNAUTHORIZED);
}
