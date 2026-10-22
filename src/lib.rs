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

// ---------------------------------------------------------------- novità per versione (CHANGELOG.md) e lista "da testare" degli sviluppatori
/// Una voce del registro delle novità.
#[derive(Clone, Debug, PartialEq)]
pub struct ChangeItem {
    pub version: String,
    /// numero progressivo dentro la versione (1…)
    pub n: u32,
    pub text: String,
}

/// Legge un CHANGELOG.md semplice: `## 1.2.0` (eventuale testo dopo) e sotto righe `- …`. Le versioni nell'ordine del file.
pub fn parse_changelog(md: &str) -> Vec<ChangeItem> {
    let mut out = vec![];
    let mut ver = String::new();
    let mut n = 0;
    for line in md.lines() {
        let l = line.trim();
        if let Some(h) = l.strip_prefix("## ") {
            ver = h.split_whitespace().next().unwrap_or("").trim_start_matches('v').to_string();
            n = 0;
        } else if let Some(t) = l.strip_prefix("- ").or_else(|| l.strip_prefix("* ")) {
            if !ver.is_empty() && !t.is_empty() {
                n += 1;
                out.push(ChangeItem { version: ver.clone(), n, text: t.to_string() });
            }
        }
    }
    out
}

/// Confronto di versioni "1.2.10" > "1.2.9".
pub fn ver_gt(a: &str, b: &str) -> bool {
    let p = |s: &str| s.split('.').map(|x| x.parse::<u64>().unwrap_or(0)).collect::<Vec<_>>();
    let (x, y) = (p(a), p(b));
    for i in 0..x.len().max(y.len()) {
        let (u, v) = (x.get(i).copied().unwrap_or(0), y.get(i).copied().unwrap_or(0));
        if u != v {
            return u > v;
        }
    }
    false
}

/// JSON del registro: `[{version, items:[{n,text}]}]`, versioni più recenti prima. Con `after` solo quelle successive a quella versione.
pub fn changelog_json(md: &str, after: Option<&str>) -> String {
    let items = parse_changelog(md);
    let mut vers: Vec<String> = vec![];
    for it in &items {
        if !vers.contains(&it.version) {
            vers.push(it.version.clone());
        }
    }
    vers.sort_by(|a, b| if ver_gt(a, b) { std::cmp::Ordering::Less } else if ver_gt(b, a) { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Equal });
    let esc = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ");
    let mut out = String::from("[");
    let mut first = true;
    for v in vers {
        if let Some(a) = after {
            if !ver_gt(&v, a) {
                continue;
            }
        }
        if !first {
            out.push(',');
        }
        first = false;
        out.push_str(&format!("{{\"version\":\"{}\",\"items\":[", esc(&v)));
        let mut f2 = true;
        for it in items.iter().filter(|i| i.version == v) {
            if !f2 {
                out.push(',');
            }
            f2 = false;
            out.push_str(&format!("{{\"n\":{},\"text\":\"{}\"}}", it.n, esc(&it.text)));
        }
        out.push_str("]}");
    }
    out.push(']');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn changelog() {
        let md = "# SNotes\n\n## 1.1.2\n- prima\n- seconda\n\n## 1.1.0 (ottobre)\n- vecchia\n";
        let items = parse_changelog(md);
        assert_eq!(items.len(), 3);
        assert_eq!(items[2], ChangeItem { version: "1.1.0".into(), n: 1, text: "vecchia".into() });
        assert!(ver_gt("1.1.2", "1.1.0") && !ver_gt("1.1.0", "1.1.0") && ver_gt("1.10.0", "1.9.9"));
        assert_eq!(changelog_json(md, Some("1.1.0")), r#"[{"version":"1.1.2","items":[{"n":1,"text":"prima"},{"n":2,"text":"seconda"}]}]"#);
        assert!(dev_tests_json("## 2.0\n- novità con «accenti» è ok\n", "2.0", &[], &[]).contains("novità con «accenti» è ok"));
        assert_eq!(client_label("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 SNotesApp/1.4").as_deref(), Some("app 1.4 · Android 14"));
        assert_eq!(client_label("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0").as_deref(), Some("Firefox · Windows"));
        assert_eq!(client_label("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15").as_deref(), Some("Safari · macOS"));
        assert_eq!(client_label("Dalvik/2.1.0 (Linux; U; Android 14)"), None);
        let j = dev_tests_json(md, "1.1.2", &[("1.1.2".into(), 2)], &[("1.1.2".into(), 1700000000)]);
        assert_eq!(j, r#"{"current":"1.1.2","versions":[{"version":"1.1.2","installed":1700000000,"items":[{"done":false,"n":1,"text":"prima"},{"done":true,"n":2,"text":"seconda"}]},{"version":"1.1.0","installed":0,"items":[{"done":false,"n":1,"text":"vecchia"}]}]}"#);
    }
}

/// Spunte "testato" degli sviluppatori: JSON `{current, versions:[{version, items:[{done,n,text}]}]}`.
/// `done` = elenco di (versione, n) già spuntate dall'utente.
/// `installed`: (versione, secondi unix della prima partenza) dalla tabella `app_versions` (vedi [`RECORD_VERSION_SQL`]).
pub fn dev_tests_json(md: &str, current: &str, done: &[(String, u32)], installed: &[(String, i64)]) -> String {
    let items = parse_changelog(md);
    let mut vers: Vec<String> = vec![];
    for it in &items {
        if !vers.contains(&it.version) {
            vers.push(it.version.clone());
        }
    }
    vers.sort_by(|a, b| if ver_gt(a, b) { std::cmp::Ordering::Less } else if ver_gt(b, a) { std::cmp::Ordering::Greater } else { std::cmp::Ordering::Equal });
    let esc = |s: &str| s.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ");
    let mut out = format!("{{\"current\":\"{}\",\"versions\":[", esc(current));
    for (i, v) in vers.iter().enumerate() {
        if i > 0 {
            out.push(',');
        }
        let at = installed.iter().find(|(iv, _)| iv == v).map(|(_, t)| *t).unwrap_or(0);
        out.push_str(&format!("{{\"version\":\"{}\",\"installed\":{at},\"items\":[", esc(v)));
        for (k, it) in items.iter().filter(|i| i.version == *v).enumerate() {
            if k > 0 {
                out.push(',');
            }
            let flag = done.iter().any(|(dv, n)| dv == v && *n == it.n);
            out.push_str(&format!("{{\"done\":{},\"n\":{},\"text\":\"{}\"}}", flag, it.n, esc(&it.text)));
        }
        out.push_str("]}");
    }
    out.push_str("]}");
    out
}

/// User-Agent → etichetta breve per l'elenco utenti: "app 1.27 · Android 14", "Chrome · Windows".
/// None per le richieste automatiche in sottofondo (es. controllo notifiche dell'app), che non contano come uso.
pub fn client_label(ua: &str) -> Option<String> {
    if ua.is_empty() || ua.starts_with("Dalvik/") || ua.starts_with("okhttp") || ua.starts_with("curl") {
        return None;
    }
    let os = if let Some(i) = ua.find("Android ") {
        let v: String = ua[i + 8..].chars().take_while(|c| c.is_ascii_digit() || *c == '.').collect();
        format!("Android {}", v.split('.').next().unwrap_or(""))
    } else if ua.contains("iPhone") || ua.contains("iPad") { "iOS".into() }
    else if ua.contains("Windows") { "Windows".into() }
    else if ua.contains("Mac OS X") || ua.contains("Macintosh") { "macOS".into() }
    else if ua.contains("Linux") { "Linux".into() }
    else { String::new() };
    let os = os.trim().to_string();
    // le nostre app Android aggiungono "<Nome>App/<versione>"
    let app = ua.split_whitespace().find_map(|t| t.split_once("App/").filter(|(n, v)| !n.is_empty() && n.chars().all(|c| c.is_ascii_alphanumeric()) && !v.is_empty()).map(|(_, v)| v.to_string()));
    let who = match app {
        Some(v) => format!("app {v}"),
        None => (if ua.contains("Edg/") { "Edge" } else if ua.contains("OPR/") { "Opera" } else if ua.contains("Firefox/") { "Firefox" }
                 else if ua.contains("Chrome/") { "Chrome" } else if ua.contains("Safari/") { "Safari" } else { "browser" }).to_string(),
    };
    Some(if os.is_empty() { who } else { format!("{who} · {os}") })
}
/// Colonne per "ultima volta visto" e "con cosa" (da aggiungere se mancano).
pub const SEEN_COLS: [(&str, &str); 2] = [("last_seen", "INTEGER"), ("last_client", "TEXT")];

/// SQL per la tabella delle spunte (da eseguire una volta nella migrazione dell'app).
pub const DEV_TESTS_SQL: &str = "CREATE TABLE IF NOT EXISTS dev_tests (user_id INTEGER NOT NULL, version TEXT NOT NULL, n INTEGER NOT NULL, done INTEGER NOT NULL DEFAULT 1, PRIMARY KEY (user_id, version, n));
CREATE TABLE IF NOT EXISTS app_versions (version TEXT PRIMARY KEY, installed INTEGER NOT NULL);";
/// Segna quando una versione è stata installata (prima partenza): `execute(RECORD_VERSION_SQL, params![versione, adesso])` all'avvio.
pub const RECORD_VERSION_SQL: &str = "INSERT OR IGNORE INTO app_versions(version, installed) VALUES (?1, ?2)";
