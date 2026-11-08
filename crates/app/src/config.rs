//! Configurazione del server: valori, controllo e campi modificabili dal pannello.
//! Come si legge e si scrive il file (TOML) lo sa l'adattatore `sapp-system`.

use std::net::SocketAddr;

use sapp_domain::{Error, Result, time::Duration};

/// Database standard.
pub const DEFAULT_DATABASE: &str = "/var/lib/sapp/sapp.db";

/// Porta della rete locale standard di SApp.
pub const DEFAULT_LAN_PORT: u16 = 8090;
/// Porta HTTPS da fuori standard di SApp (Caddy).
pub const DEFAULT_PUBLIC_PORT: u16 = 19443;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ServerConfig {
    /// indirizzo e porta della rete locale
    pub bind: SocketAddr,
    /// indirizzo pubblico (DDNS), vuoto = solo rete locale
    pub public_host: String,
    /// porta HTTPS da fuori, 0 = spento
    pub public_port: u16,
    pub session_days: u32,
    pub max_fails: u32,
    pub lock_minutes: u32,
    /// file del database SQLite
    pub database: String,
    /// primo amministratore (solo al primo avvio)
    pub username: String,
    pub password_hash: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        ServerConfig {
            bind: SocketAddr::from(([0, 0, 0, 0], DEFAULT_LAN_PORT)),
            public_host: String::new(),
            public_port: DEFAULT_PUBLIC_PORT,
            session_days: 30,
            max_fails: 5,
            lock_minutes: 15,
            database: DEFAULT_DATABASE.into(),
            username: "admin".into(),
            password_hash: String::new(),
        }
    }
}

impl ServerConfig {
    /// Indirizzo pubblico completo, se l'accesso da fuori è acceso.
    pub fn public_url(&self) -> Option<String> {
        (!self.public_host.is_empty() && self.public_port > 0).then(|| format!("https://{}:{}", self.public_host, self.public_port))
    }
    pub fn lan_port(&self) -> u16 {
        self.bind.port()
    }
    pub fn session_ttl(&self) -> Duration {
        Duration::days(self.session_days.into())
    }
    pub fn lock(&self) -> Duration {
        Duration::minutes(self.lock_minutes.into())
    }

    /// Controlli che riguardano più campi insieme.
    pub fn check(&self) -> Result<()> {
        if self.public_port > 0 && self.public_port == self.lan_port() {
            return Err(Error::invalid("La porta pubblica e quella della rete locale devono essere diverse."));
        }
        Ok(())
    }

    /// Valore di un campo, come testo.
    pub fn value_of(&self, key: &str) -> String {
        match key {
            "bind" => self.bind.to_string(),
            "public_host" => self.public_host.clone(),
            "public_port" => self.public_port.to_string(),
            "session_days" => self.session_days.to_string(),
            "max_fails" => self.max_fails.to_string(),
            "lock_minutes" => self.lock_minutes.to_string(),
            "database" => self.database.clone(),
            _ => String::new(),
        }
    }

    /// Controlla il testo scritto in un campo e, se va bene, lo mette nella configurazione.
    pub fn set(&mut self, field: &Field, raw: &str) -> Result<()> {
        let v = raw.trim();
        let bad = |m: &str| Error::invalid(format!("{}: {m}", field.label));
        if v.chars().any(|c| c.is_control() || matches!(c, '"' | '\\' | '$' | '`' | '\'')) {
            return Err(bad("caratteri non ammessi"));
        }
        match (field.key, field.kind) {
            ("bind", FieldKind::Addr) => match v.parse::<SocketAddr>() {
                Ok(a) if a.port() >= 1024 => self.bind = a,
                Ok(_) => return Err(bad("usa una porta da 1024 in su")),
                Err(_) => return Err(bad(&format!("serve indirizzo:porta, es. 0.0.0.0:{DEFAULT_LAN_PORT}"))),
            },
            ("public_host", FieldKind::Host) => self.public_host = parse_host(v).map_err(|_| bad("nome host non valido"))?,
            (key, FieldKind::Int(min, max)) => {
                let n = match v.parse::<u32>() {
                    Ok(n) if (min..=max).contains(&n) => n,
                    _ => return Err(bad(&format!("numero tra {min} e {max}"))),
                };
                match key {
                    "public_port" => self.public_port = u16::try_from(n).map_err(|_| bad("porta non valida"))?,
                    "session_days" => self.session_days = n,
                    "max_fails" => self.max_fails = n,
                    "lock_minutes" => self.lock_minutes = n,
                    _ => return Err(bad("campo sconosciuto")),
                }
            }
            _ => return Err(bad("non si modifica dal pannello")),
        }
        Ok(())
    }
}

/// Nome host senza https:// davanti né / in fondo; vuoto va bene (= solo rete locale).
pub fn parse_host(v: &str) -> Result<String> {
    let h = v.trim().trim_start_matches("https://").trim_start_matches("http://").trim_end_matches('/');
    if h.len() <= 253 && h.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        Ok(h.to_ascii_lowercase())
    } else {
        Err(Error::invalid("nome host non valido"))
    }
}

// ---------------------------------------------------------------- campi modificabili dal pannello

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FieldKind {
    /// indirizzo:porta
    Addr,
    /// nome host
    Host,
    /// numero tra min e max
    Int(u32, u32),
    /// solo da leggere
    ReadOnly,
}

#[derive(Debug)]
pub struct Field {
    pub key: &'static str,
    pub group: &'static str,
    pub label: &'static str,
    pub help: &'static str,
    pub kind: FieldKind,
}

pub const FIELDS: &[Field] = &[
    Field {
        key: "bind",
        group: "Rete locale",
        label: "Indirizzo e porta (indirizzo:porta)",
        help: "In casa si apre http://IP-del-server:porta. Standard SApp: 0.0.0.0:8090. Cambiandola la pagina si sposta sulla nuova porta.",
        kind: FieldKind::Addr,
    },
    Field {
        key: "public_host",
        group: "Accesso da fuori (HTTPS)",
        label: "Indirizzo pubblico (DDNS)",
        help: "Senza https:// davanti, es. il DDNS del router. Vuoto = solo rete locale. L'installazione come app e l'app Android da fuori casa vogliono l'HTTPS.",
        kind: FieldKind::Host,
    },
    Field {
        key: "public_port",
        group: "Accesso da fuori (HTTPS)",
        label: "Porta HTTPS pubblica",
        help: "Da fuori: https://DDNS:porta. Standard SApp: 19443. Salvando si aggiorna Caddy da solo; sul router va inoltrata questa porta (e la 80 per il certificato). 0 = spento.",
        kind: FieldKind::Int(0, 65535),
    },
    Field {
        key: "session_days",
        group: "Sicurezza",
        label: "Durata dell'accesso (giorni)",
        help: "Dopo quanti giorni bisogna rifare il login (telefono compreso).",
        kind: FieldKind::Int(1, 365),
    },
    Field {
        key: "max_fails",
        group: "Sicurezza",
        label: "Tentativi di accesso sbagliati prima del blocco",
        help: "Contati per indirizzo IP.",
        kind: FieldKind::Int(3, 50),
    },
    Field { key: "lock_minutes", group: "Sicurezza", label: "Minuti di blocco", help: "", kind: FieldKind::Int(1, 1440) },
    Field { key: "database", group: "Dati", label: "Database", help: "Si cambia solo a mano sul server.", kind: FieldKind::ReadOnly },
];

pub fn field(key: &str) -> Option<&'static Field> {
    FIELDS.iter().find(|f| f.key == key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn predefiniti() {
        let c = ServerConfig::default();
        assert_eq!((c.lan_port(), c.public_port), (DEFAULT_LAN_PORT, DEFAULT_PUBLIC_PORT));
        assert_eq!(c.public_url(), None);
        assert_eq!(c.session_ttl().as_secs(), 30 * 86_400);
    }

    #[test]
    fn campi() {
        let mut c = ServerConfig::default();
        c.set(field("public_host").unwrap(), "https://Casa.Example.net/").unwrap();
        assert_eq!(c.public_url(), Some(format!("https://casa.example.net:{DEFAULT_PUBLIC_PORT}")));
        c.set(field("public_port").unwrap(), " 443 ").unwrap();
        assert_eq!(c.public_port, 443);
        assert!(c.set(field("public_port").unwrap(), "70000").is_err());
        assert!(c.set(field("public_host").unwrap(), "a\"b").is_err());
        assert!(c.set(field("bind").unwrap(), "0.0.0.0:80").is_err());
        assert!(c.set(field("database").unwrap(), "/tmp/x.db").is_err());
        assert!(c.check().is_ok());
        c.set(field("public_port").unwrap(), &DEFAULT_LAN_PORT.to_string()).unwrap();
        assert!(c.check().is_err(), "porte uguali");
    }
}
