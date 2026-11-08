//! Accesso: controllo di ogni richiesta (sessione e permessi), protezione anti-CSRF, pagina di accesso, accesso
//! dell'app Android, uscita, cambio password, profilo.
//!
//! Il browser ha la sessione nel cookie; l'app Android manda il suo gettone in `Authorization: Bearer …` (niente
//! cookie: per lei il controllo anti-CSRF non serve, un altro sito non può aggiungere quell'intestazione).

use std::net::{IpAddr, SocketAddr};

use axum::{
    Form, Json,
    extract::{ConnectInfo, FromRequestParts, Request, State},
    http::{HeaderMap, Method, StatusCode, header, request::Parts},
    middleware::Next,
    response::{IntoResponse, Redirect, Response},
};
use sapp_app::accounts::Login;
use sapp_domain::user::{Role, User};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{Shared, assets, error::ApiResult, run, view};

pub const COOKIE: &str = "sapp_session";
/// Intestazione che la pagina mette in ogni richiesta che modifica qualcosa (un altro sito non può farlo).
pub const CSRF_HEADER: &str = "x-sapp";

/// Utente che fa la richiesta (messo dal controllo di accesso).
pub struct Me(pub User);

impl<S: Send + Sync> FromRequestParts<S> for Me {
    type Rejection = StatusCode;
    async fn from_request_parts(parts: &mut Parts, _: &S) -> Result<Self, StatusCode> {
        parts.extensions.get::<User>().cloned().map(Me).ok_or(StatusCode::UNAUTHORIZED)
    }
}

fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let cookies = headers.get(header::COOKIE)?.to_str().ok()?;
    cookies.split(';').filter_map(|c| c.trim().split_once('=')).find(|(k, _)| *k == COOKIE).map(|(_, v)| v.to_string())
}

fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let v = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    v.strip_prefix("Bearer ").map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

/// Gettone della sessione: quello dell'app se c'è, se no il cookie del browser.
pub(crate) fn session_token(headers: &HeaderMap) -> Option<String> {
    bearer_token(headers).or_else(|| cookie_token(headers))
}

pub(crate) fn agent(headers: &HeaderMap) -> String {
    headers.get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("").to_string()
}

async fn resolve(st: &Shared, headers: &HeaderMap) -> Option<User> {
    let token = session_token(headers)?;
    let ua = agent(headers);
    run(st, move |app| app.session_user(&token, &ua)).await.ok().flatten()
}

// ---------------------------------------------------------------- permessi per percorso

fn public_path(p: &str) -> bool {
    // l'app Android si scarica anche prima di entrare (dalla pagina d'accesso): nell'APK non c'è niente di privato
    matches!(p, "/login" | "/api/version" | "/api/changelog" | "/api/device/login" | "/api/app" | "/app/sapp.apk") || assets::is_asset(p)
}
fn admin_path(p: &str) -> bool {
    p == "/admin" || p.starts_with("/api/admin/") || p.starts_with("/api/update/")
}
fn any_user_path(p: &str) -> bool {
    matches!(p, "/password" | "/api/password" | "/api/me" | "/api/profile" | "/api/live" | "/logout")
}

/// Controlla accesso e permessi di ogni richiesta:
/// - senza sessione: pagine → accesso, API → 401
/// - password da cambiare: solo la pagina del cambio password
/// - l'amministratore vede solo le sue pagine, gli utenti solo le loro
pub async fn gate(State(st): State<Shared>, mut req: Request, next: Next) -> Response {
    let path = req.uri().path().to_string();
    if public_path(&path) {
        return next.run(req).await;
    }
    let api = path.starts_with("/api/") || path.starts_with("/app/");
    let Some(user) = resolve(&st, req.headers()).await else {
        return if api { StatusCode::UNAUTHORIZED.into_response() } else { Redirect::to("/login").into_response() };
    };
    let deny = |to: &str| -> Response {
        if api { (StatusCode::FORBIDDEN, Json(json!({ "ok": false, "error": "non permesso" }))).into_response() } else { Redirect::to(to).into_response() }
    };
    if !any_user_path(&path) {
        if user.must_change {
            return deny("/password");
        }
        let admin = user.role == Role::Admin;
        if admin_path(&path) != admin {
            return deny(user.role.home());
        }
    }
    req.extensions_mut().insert(user);
    next.run(req).await
}

/// Le richieste API del browser che modificano qualcosa devono avere l'intestazione anti-CSRF.
pub async fn csrf(req: Request, next: Next) -> Response {
    let writes = req.method() != Method::GET && req.method() != Method::HEAD;
    // l'app Android: gettone nell'intestazione e niente cookie (anche per entrare, con nome e password in JSON)
    let app_client = cookie_token(req.headers()).is_none() && (bearer_token(req.headers()).is_some() || req.uri().path() == "/api/device/login");
    let ok = app_client || req.headers().get(CSRF_HEADER).is_some_and(|v| v == "1");
    if writes && req.uri().path().starts_with("/api/") && !ok {
        return (StatusCode::FORBIDDEN, Json(json!({ "ok": false, "error": "richiesta non valida" }))).into_response();
    }
    next.run(req).await
}

// ---------------------------------------------------------------- accesso e uscita

/// IP reale del client: dietro Caddy (connessione da localhost) uso X-Forwarded-For.
fn client_ip(peer: SocketAddr, headers: &HeaderMap) -> IpAddr {
    if peer.ip().is_loopback()
        && let Some(ip) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()).and_then(|v| v.split(',').next()).and_then(|v| v.trim().parse().ok())
    {
        return ip;
    }
    peer.ip()
}

fn via_https(headers: &HeaderMap) -> bool {
    headers.get("x-forwarded-proto").is_some_and(|v| v.as_bytes().eq_ignore_ascii_case(b"https"))
}

pub async fn login_page(headers: HeaderMap, State(st): State<Shared>) -> Response {
    match resolve(&st, &headers).await {
        Some(u) => Redirect::to(if u.must_change { "/password" } else { u.role.home() }).into_response(),
        None => assets::login(),
    }
}

#[derive(Deserialize)]
pub struct LoginForm {
    username: String,
    password: String,
}

pub async fn login_submit(State(st): State<Shared>, ConnectInfo(peer): ConnectInfo<SocketAddr>, headers: HeaderMap, Form(f): Form<LoginForm>) -> Response {
    let ip = client_ip(peer, &headers);
    let ua = agent(&headers);
    let name = f.username.clone();
    let outcome = run(&st, move |app| app.login(&f.username, &f.password, ip, &ua, None)).await;
    match outcome {
        Ok(Login::Ok { token, home, ttl }) => {
            let secure = if via_https(&headers) { "; Secure" } else { "" };
            let cookie = format!("{COOKIE}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={}{secure}", ttl.as_secs());
            ([(header::SET_COOKIE, cookie)], Redirect::to(home)).into_response()
        }
        Ok(Login::Wrong { locked, lock_minutes }) => {
            eprintln!("accesso fallito per «{}» da {ip}", name.trim());
            // un po' di attesa: i tentativi a raffica costano tempo
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            Redirect::to(&if locked { format!("/login?err=locked&min={lock_minutes}") } else { "/login?err=1".into() }).into_response()
        }
        Ok(Login::Locked { minutes }) => Redirect::to(&format!("/login?err=locked&min={minutes}")).into_response(),
        Err(e) => {
            eprintln!("ERRORE accesso: {}", e.0);
            Redirect::to("/login?err=1").into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct DeviceLoginIn {
    username: String,
    password: String,
    #[serde(default)]
    device: String,
}

/// Accesso dell'app Android: risponde col gettone da mandare in `Authorization: Bearer …`.
pub async fn device_login(State(st): State<Shared>, ConnectInfo(peer): ConnectInfo<SocketAddr>, headers: HeaderMap, Json(b): Json<DeviceLoginIn>) -> Response {
    let ip = client_ip(peer, &headers);
    let ua = agent(&headers);
    let name = b.username.clone();
    let outcome = run(&st, move |app| app.login(&b.username, &b.password, ip, &ua, Some(&b.device))).await;
    let fail = |status: StatusCode, msg: String| (status, Json(json!({ "ok": false, "error": msg }))).into_response();
    match outcome {
        Ok(Login::Ok { token, home, .. }) => {
            if home == "/password" {
                // la password provvisoria va cambiata dal browser: la sessione appena aperta non serve
                let t = token.clone();
                let _ = run(&st, move |app| app.logout(&t)).await;
                return fail(StatusCode::FORBIDDEN, "Prima cambia la password dalla pagina web di SApp, poi entra dall'app.".into());
            }
            Json(json!({ "ok": true, "token": token })).into_response()
        }
        Ok(Login::Wrong { locked, lock_minutes }) => {
            eprintln!("accesso dall'app fallito per «{}» da {ip}", name.trim());
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            let msg = if locked { format!("Troppi tentativi: riprova tra {lock_minutes} minuti.") } else { "Nome utente o password non corretti.".into() };
            fail(StatusCode::UNAUTHORIZED, msg)
        }
        Ok(Login::Locked { minutes }) => fail(StatusCode::TOO_MANY_REQUESTS, format!("Troppi tentativi: riprova tra {minutes} minuti.")),
        Err(e) => e.into_response(),
    }
}

pub async fn logout(State(st): State<Shared>, headers: HeaderMap) -> Response {
    if let Some(t) = session_token(&headers) {
        let _ = run(&st, move |app| app.logout(&t)).await;
    }
    let cookie = format!("{COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
    ([(header::SET_COOKIE, cookie)], Redirect::to("/login")).into_response()
}

/// Uscita dell'app Android (scollega questo telefono).
pub async fn device_logout(State(st): State<Shared>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    if let Some(t) = bearer_token(&headers) {
        run(&st, move |app| app.logout(&t)).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn me(State(st): State<Shared>, Me(u): Me) -> Json<Value> {
    let mut v = view::user(&u);
    v["version"] = json!(st.app.version());
    Json(v)
}

#[derive(Deserialize)]
pub struct ChangeIn {
    current: String,
    new: String,
}

/// Cambio password: le altre sessioni dell'utente vengono chiuse, questa resta.
pub async fn change_password(State(st): State<Shared>, Me(u): Me, headers: HeaderMap, Json(b): Json<ChangeIn>) -> ApiResult<Json<Value>> {
    let keep = session_token(&headers).unwrap_or_default();
    let home = u.role.home();
    run(&st, move |app| app.change_password(&u, &b.current, &b.new, &keep)).await?;
    Ok(Json(json!({ "ok": true, "redirect": home })))
}

#[derive(Deserialize)]
pub struct ProfileIn {
    display_name: String,
    color: String,
}

pub async fn update_profile(State(st): State<Shared>, Me(u): Me, Json(b): Json<ProfileIn>) -> ApiResult<Json<Value>> {
    let u = run(&st, move |app| app.update_profile(&u, &b.display_name, &b.color)).await?;
    Ok(Json(json!({ "ok": true, "user": view::user(&u) })))
}
