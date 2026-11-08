//! SApp — il programma: legge la configurazione, collega gli adattatori ai casi d'uso e avvia il server web (o un
//! comando di servizio).
//!
//! Questo è il punto in cui si collega tutto (composition root): legge la configurazione, apre il database, crea gli
//! adattatori, li passa ai casi d'uso e avvia il server web con i lavori periodici. Più i comandi da terminale usati
//! da install.sh e per l'emergenza.

use std::{
    io::{BufRead, Write as _},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};

use sapp_app::{App, Ports, config::ServerConfig, ports::Security};
use sapp_sqlite::SqliteDb;
use sapp_system::{
    LinuxHost, SystemClock,
    apk::ApkFolder,
    config_file::{self, TomlConfigFile},
    security::Argon2Security,
    update::{self, UpdateArea},
};

const VERSION: &str = env!("CARGO_PKG_VERSION");

fn fatal(msg: &str) -> ! {
    eprintln!("ERRORE: {msg}");
    std::process::exit(1);
}

/// Valore dopo `--config` (o il percorso standard).
fn config_path(args: &[String]) -> String {
    args.windows(2).find(|w| w[0] == "--config").map(|w| w[1].clone()).unwrap_or_else(|| config_file::DEFAULT_PATH.into())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("sapp {VERSION}");
        return;
    }
    match args.get(1).map(String::as_str) {
        Some("hash-password") => hash_password(),
        Some("check-config") => check_config(args.get(2).map(String::as_str).unwrap_or_default()),
        Some("verify-package") => verify_package(args.get(2).map(String::as_str)),
        Some("reset-password") => reset_password(&args),
        Some("help" | "--help" | "-h") => help(),
        Some(cmd) if !cmd.starts_with('-') => {
            help();
            fatal(&format!("comando sconosciuto: {cmd}"))
        }
        _ => serve(&args),
    }
}

fn help() {
    println!(
        "SApp {VERSION}\n\nUso:\n  sapp [--config FILE]            avvia il server (standard {})\n  sapp --version\n  sapp hash-password              impronta di una password per il config (letta dall'input)\n  sapp check-config FILE          controlla un file di configurazione\n  sapp verify-package ZIP         controlla la firma di un pacchetto\n  sapp reset-password UTENTE [--config FILE]   password temporanea nuova",
        config_file::DEFAULT_PATH
    );
}

/// Impronta per password_hash nel config (install.sh la passa sull'input).
fn hash_password() {
    eprint!("Nuova password: ");
    std::io::stderr().flush().ok();
    let mut pw = String::new();
    std::io::stdin().lock().read_line(&mut pw).ok();
    let pw = pw.trim_end_matches(['\r', '\n']);
    if pw.chars().count() < sapp_domain::user::MIN_PASSWORD {
        fatal(&format!("usa almeno {} caratteri", sapp_domain::user::MIN_PASSWORD));
    }
    println!("\nCopia questa riga nel config.toml:\npassword_hash = \"{}\"", Argon2Security.hash_password(pw));
}

/// Usato dall'aggiornatore prima di installare una configurazione nuova.
fn check_config(path: &str) {
    match config_file::load(path) {
        Ok(c) => println!("ok {} {} {}", c.bind, c.public_host, c.public_port),
        Err(e) => fatal(&e),
    }
}

/// Usato dall'aggiornatore (root) prima di installare un pacchetto: la firma, se è attiva.
fn verify_package(path: Option<&str>) {
    let p = path.unwrap_or_else(|| fatal("uso: sapp verify-package PACCHETTO.zip"));
    let data = std::fs::read(p).unwrap_or_else(|e| fatal(&format!("impossibile leggere {p}: {e}")));
    match update::verify_package(&data) {
        Ok(true) => println!("firma valida"),
        Ok(false) => println!("firma non attiva: pacchetto non controllato"),
        Err(e) => fatal(&e.msg),
    }
}

/// Collega gli adattatori ai casi d'uso.
fn build_app(cfg: ServerConfig, cfg_path: &str) -> App {
    let db = SqliteDb::open(&PathBuf::from(&cfg.database)).unwrap_or_else(|e| fatal(&format!("database {}: {e}", cfg.database)));
    let ports = Ports {
        db: Arc::new(db),
        security: Arc::new(Argon2Security),
        clock: Arc::new(SystemClock),
        host: Arc::new(LinuxHost),
        config_file: Arc::new(TomlConfigFile::new(cfg_path)),
        updater: Arc::new(UpdateArea::from_env(VERSION)),
        apk: Arc::new(ApkFolder::from_env()),
    };
    App::new(ports, cfg, VERSION)
}

/// Per l'emergenza: password temporanea nuova per un utente (cambio obbligatorio al primo accesso).
fn reset_password(args: &[String]) {
    let user = args.get(2).filter(|u| !u.starts_with('-')).unwrap_or_else(|| fatal("uso: sapp reset-password UTENTE [--config FILE]"));
    let path = config_path(args);
    let cfg = config_file::load(&path).unwrap_or_else(|e| fatal(&e));
    match build_app(cfg, &path).reset_password_by_name(user) {
        Ok(pw) => println!("Password temporanea di «{user}»: {pw}\nVa cambiata al primo accesso."),
        Err(e) => fatal(&e.msg),
    }
}

fn serve(args: &[String]) {
    let path = config_path(args);
    let cfg = config_file::load(&path).unwrap_or_else(|e| fatal(&e));
    if !Argon2Security::is_hash(&cfg.password_hash) {
        eprintln!("attenzione: password_hash nel config non valido (serve solo al primo avvio)");
    }
    let addr = cfg.bind;
    let app = Arc::new(build_app(cfg, &path));
    // (un'app che ne sostituisce una vecchia può passare qui gli amministratori di quella: stessa password)
    match app.bootstrap_admin(&[]) {
        Ok(names) if !names.is_empty() => {
            println!("creati gli amministratori (dal config): {}", names.iter().map(|n| n.as_str()).collect::<Vec<_>>().join(", "));
        }
        Ok(_) => {}
        Err(e) => eprintln!("ERRORE creazione amministratore: {e}"),
    }
    let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap_or_else(|e| fatal(&e.to_string()));
    rt.block_on(async move {
        let boot = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
        let state = sapp_http::AppState::new(app.clone(), boot);
        tokio::spawn(housekeeping(app.clone()));
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap_or_else(|e| fatal(&format!("impossibile ascoltare su {addr}: {e}")));
        println!("SApp {VERSION} in ascolto su http://{addr} (db: {})", app.config().database);
        axum::serve(listener, sapp_http::service(state)).await.unwrap_or_else(|e| fatal(&e.to_string()));
    });
}

/// Lavori periodici: ogni ora via le sessioni scadute (l'app aggiunge qui le sue pulizie).
async fn housekeeping(app: Arc<App>) {
    let mut every = tokio::time::interval(Duration::from_secs(3600));
    loop {
        every.tick().await;
        let a = app.clone();
        match tokio::task::spawn_blocking(move || a.purge_sessions()).await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => eprintln!("ERRORE pulizia: {e}"),
            Err(e) => eprintln!("ERRORE pulizia: {e}"),
        }
    }
}
