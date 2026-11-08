//! File di configurazione (/etc/sapp/config.toml): lettura, controllo e testo del file.
//! Il programma lo legge ma non lo scrive: la configurazione nuova la installa l'aggiornatore di sistema.

use std::net::SocketAddr;

use sapp_app::{
    config::{ServerConfig, parse_host},
    ports::ConfigFile,
};
use serde::Deserialize;

pub const DEFAULT_PATH: &str = "/etc/sapp/config.toml";

/// Il file com'è scritto: ogni chiave può mancare (vale quella standard).
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FileConfig {
    bind: Option<String>,
    public_host: Option<String>,
    public_port: Option<u16>,
    session_days: Option<u32>,
    max_fails: Option<u32>,
    lock_minutes: Option<u32>,
    database: Option<String>,
    username: Option<String>,
    password_hash: Option<String>,
}

/// Legge e controlla il testo del file.
pub fn parse(text: &str, path: &str) -> Result<ServerConfig, String> {
    let f: FileConfig = toml::from_str(text).map_err(|e| format!("errore in {path}: {e}"))?;
    let d = ServerConfig::default();
    let bind = match f.bind {
        Some(b) => b.parse::<SocketAddr>().map_err(|_| format!("bind non valido: {b}"))?,
        None => d.bind,
    };
    let public_host = match f.public_host {
        Some(h) => parse_host(&h).map_err(|_| format!("public_host non valido: {h}"))?,
        None => d.public_host,
    };
    let cfg = ServerConfig {
        bind,
        public_host,
        public_port: f.public_port.unwrap_or(d.public_port),
        session_days: f.session_days.unwrap_or(d.session_days).clamp(1, 365),
        max_fails: f.max_fails.unwrap_or(d.max_fails).clamp(3, 50),
        lock_minutes: f.lock_minutes.unwrap_or(d.lock_minutes).clamp(1, 1440),
        database: f.database.unwrap_or(d.database),
        username: f.username.unwrap_or(d.username),
        password_hash: f.password_hash.unwrap_or(d.password_hash),
    };
    cfg.check().map_err(|e| e.msg)?;
    Ok(cfg)
}

/// Legge il file.
pub fn load(path: &str) -> Result<ServerConfig, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("impossibile leggere {path}: {e}"))?;
    parse(&raw, path)
}

/// Testo completo del file (formato fisso, con i commenti).
pub fn render(c: &ServerConfig) -> String {
    format!(
        r#"# SApp — configurazione (/etc/sapp/config.toml)
# Si modifica dalla pagina dell'amministratore (Configurazione). A mano: dopo, sudo systemctl restart sapp

# Rete locale: indirizzo e porta della pagina
bind = "{bind}"

# Accesso da fuori in HTTPS tramite Caddy: https://public_host:public_port (vuoto / 0 = solo rete locale)
public_host = "{host}"
public_port = {pport}

# Sicurezza
session_days = {sd}      # durata dell'accesso
max_fails = {mf}          # tentativi sbagliati prima del blocco (per IP)
lock_minutes = {lm}      # durata del blocco

# Database SQLite (tutti i dati)
database = "{db}"

# Primo amministratore: usato solo al primo avvio, poi gli utenti stanno nel database
username = "{user}"
password_hash = "{hash}"
"#,
        bind = c.bind,
        host = c.public_host,
        pport = c.public_port,
        sd = c.session_days,
        mf = c.max_fails,
        lm = c.lock_minutes,
        db = c.database,
        user = c.username,
        hash = c.password_hash,
    )
}

/// Il file di configurazione su disco.
pub struct TomlConfigFile {
    path: String,
}

impl TomlConfigFile {
    pub fn new(path: impl Into<String>) -> Self {
        TomlConfigFile { path: path.into() }
    }
}

impl ConfigFile for TomlConfigFile {
    fn path(&self) -> String {
        self.path.clone()
    }
    fn read(&self) -> Option<ServerConfig> {
        load(&self.path).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use sapp_app::config::{DEFAULT_LAN_PORT as LAN, DEFAULT_PUBLIC_PORT as PUBLIC};

    #[test]
    fn lettura_e_scrittura() {
        let c = parse(&format!("bind = \"0.0.0.0:{LAN}\"\npublic_host = \"casa.example.net\"\n"), "prova").unwrap();
        assert_eq!((c.public_port, c.session_days, c.lan_port()), (PUBLIC, 30, LAN));
        assert_eq!(c.public_url(), Some(format!("https://casa.example.net:{PUBLIC}")));
        let again = parse(&render(&c), "prova").unwrap();
        assert_eq!(again, c);
        assert!(parse("bind = \"niente\"", "prova").is_err());
        assert!(parse("sconosciuta = 1", "prova").is_err());
        assert!(parse(&format!("public_port = {LAN}"), "prova").is_err(), "stessa porta della rete locale");
    }

    #[test]
    fn esempio_del_pacchetto() {
        let c = parse(include_str!("../../../packaging/config.example.toml"), "esempio").unwrap();
        assert_eq!((c.lan_port(), c.public_port, c.password_hash.as_str()), (LAN, PUBLIC, "INCOLLA_QUI_L_HASH"));
        assert_eq!(c.database, sapp_app::config::DEFAULT_DATABASE);
    }
}
