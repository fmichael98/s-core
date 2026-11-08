//! Casi d'uso: cosa si può fare, con le regole del dominio e il mondo esterno solo attraverso le porte.
//!
//! [`App`] tiene le porte e la configurazione in uso; i casi d'uso sono i suoi metodi, divisi per argomento:
//! - [`accounts`]: accesso (browser e app Android), sessioni, password e profilo di chi è collegato
//! - [`users`]: gestione degli utenti (amministratore)
//! - [`system`]: configurazione, stato del server, copia del database, aggiornamenti (amministratore)
//!
//! I casi d'uso propri dell'app vanno in moduli accanto a questi (uno per argomento).
//!
//! Tutti i metodi sono sincroni: chi li chiama da codice asincrono li esegue fuori dai thread del server web.

pub mod accounts;
pub mod config;
pub mod ports;
pub mod system;
pub mod throttle;
pub mod users;

use std::sync::{Arc, Mutex, RwLock};

use config::ServerConfig;
use ports::{AppPackage, Clock, ConfigFile, Database, Host, Security, Updater};
use throttle::LoginThrottle;

/// Gli adattatori che servono ai casi d'uso.
pub struct Ports {
    pub db: Arc<dyn Database>,
    pub security: Arc<dyn Security>,
    pub clock: Arc<dyn Clock>,
    pub host: Arc<dyn Host>,
    pub config_file: Arc<dyn ConfigFile>,
    pub updater: Arc<dyn Updater>,
    pub apk: Arc<dyn AppPackage>,
}

pub struct App {
    ports: Ports,
    /// configurazione con cui è partito il server (quella nuova vale dopo il riavvio)
    config: RwLock<ServerConfig>,
    throttle: Mutex<LoginThrottle>,
    /// impronta di una password qualsiasi: per un nome utente che non esiste si fa lo stesso lavoro (e si impiega
    /// lo stesso tempo) che per uno che esiste, così dai tempi non si capisce quali nomi ci sono
    dummy_hash: String,
    version: &'static str,
}

impl App {
    pub fn new(ports: Ports, config: ServerConfig, version: &'static str) -> App {
        let dummy_hash = ports.security.hash_password("sapp-nessuno");
        App { ports, config: RwLock::new(config), throttle: Mutex::new(LoginThrottle::default()), dummy_hash, version }
    }

    pub fn version(&self) -> &'static str {
        self.version
    }

    /// Configurazione in uso.
    pub fn config(&self) -> ServerConfig {
        self.config.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    fn db(&self) -> &dyn Database {
        &*self.ports.db
    }

    /// L'app Android da scaricare, se il pacchetto la conteneva.
    pub fn apk_info(&self) -> Option<ports::ApkInfo> {
        self.ports.apk.info()
    }
    pub fn apk_bytes(&self) -> sapp_domain::Result<Vec<u8>> {
        self.ports.apk.read()
    }
}
