//! Porte: ciò di cui i casi d'uso hanno bisogno dal mondo esterno.
//!
//! Gli adattatori le implementano (`sapp-sqlite` i dati, `sapp-system` password, orologio, configurazione,
//! aggiornamenti e APK); i casi d'uso conoscono solo queste interfacce. Le porte proprie dell'app (i suoi dati,
//! servizi esterni) si aggiungono qui accanto.

use std::path::{Path, PathBuf};

use sapp_domain::{
    Date, DateTime, Result,
    time::Timestamp,
    user::{AvatarColor, DisplayName, Role, User, UserId, Username},
};

use crate::config::ServerConfig;

// ---------------------------------------------------------------- dati

/// Il database. Tutto passa da una transazione: o si salva tutto o niente.
pub trait Database: Send + Sync {
    /// Esegue `f` in una transazione: confermata se `f` riesce, annullata se fallisce.
    fn transaction(&self, f: &mut dyn FnMut(&dyn Repos) -> Result<()>) -> Result<()>;
    /// Copia coerente del database (anche mentre è in uso) nel file `path`, senza i segreti (codici delle app
    /// collegate, sessioni): dalla copia scaricata non devono uscire.
    fn backup_to(&self, path: &Path) -> Result<()>;
    /// Dove sta (per il pannello).
    fn location(&self) -> String;
    /// Spazio occupato, in byte.
    fn size_bytes(&self) -> u64;
}

/// Tutti i dati, dentro una transazione.
pub trait Repos: UserRepo + SessionRepo + SettingsRepo {}

/// Esegue `f` in una transazione e ne restituisce il risultato.
pub fn tx<T>(db: &dyn Database, f: impl FnOnce(&dyn Repos) -> Result<T>) -> Result<T> {
    let mut f = Some(f);
    let mut out = None;
    db.transaction(&mut |r| {
        if let Some(f) = f.take() {
            out = Some(f(r)?);
        }
        Ok(())
    })?;
    out.ok_or_else(|| sapp_domain::Error::internal("transazione non eseguita"))
}

/// Utente nuovo da salvare.
pub struct NewUser {
    pub username: Username,
    pub display_name: DisplayName,
    pub color: AvatarColor,
    pub role: Role,
    pub pass_hash: String,
    pub must_change: bool,
    pub created: Timestamp,
}

pub trait UserRepo {
    /// Errore `Conflict` se il nome utente c'è già.
    fn insert_user(&self, u: &NewUser) -> Result<UserId>;
    fn user(&self, id: UserId) -> Result<Option<User>>;
    fn user_by_name(&self, name: &Username) -> Result<Option<User>>;
    /// Tutti, in ordine di nome utente.
    fn users(&self) -> Result<Vec<User>>;
    fn password_hash(&self, id: UserId) -> Result<Option<String>>;
    fn set_password(&self, id: UserId, hash: &str, must_change: bool) -> Result<()>;
    fn set_profile(&self, id: UserId, name: &DisplayName, color: AvatarColor) -> Result<()>;
    fn set_disabled(&self, id: UserId, disabled: bool) -> Result<()>;
    fn set_last_login(&self, id: UserId, at: Timestamp) -> Result<()>;
    fn delete_user(&self, id: UserId) -> Result<()>;
}

/// Impronta del gettone di sessione: nel database c'è solo questa, così chi legge una copia del database (es. un
/// backup) non può entrare con le sessioni aperte.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct SessionKey(pub String);

/// Sessione salvata: del browser (cookie) o di un telefono con l'app (gettone nell'intestazione).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Session {
    pub user: UserId,
    pub expires: Timestamp,
    pub last_seen: Timestamp,
    /// nome del telefono, se è l'app Android
    pub device: Option<String>,
}

/// Un telefono collegato con l'app.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DeviceSession {
    pub id: i64,
    pub name: String,
    pub created: Timestamp,
    pub last_seen: Timestamp,
    /// versione dell'app (dall'intestazione User-Agent)
    pub agent: String,
}

pub trait SessionRepo {
    fn insert_session(&self, key: &SessionKey, user: UserId, now: Timestamp, expires: Timestamp, agent: &str, device: Option<&str>) -> Result<()>;
    fn session(&self, key: &SessionKey) -> Result<Option<Session>>;
    /// Ultima volta vista (e, per i telefoni, nuova scadenza: restano collegati finché si usano).
    fn touch_session(&self, key: &SessionKey, at: Timestamp, agent: &str, expires: Option<Timestamp>) -> Result<()>;
    fn delete_session(&self, key: &SessionKey) -> Result<()>;
    /// Chiude le sessioni di un utente, tranne `keep` (quella da cui sta lavorando).
    fn delete_sessions_of(&self, user: UserId, keep: Option<&SessionKey>) -> Result<()>;
    /// Toglie le sessioni scadute; quante.
    fn delete_expired_sessions(&self, now: Timestamp) -> Result<usize>;
    /// Sessioni aperte per utente.
    fn sessions_per_user(&self, now: Timestamp) -> Result<Vec<(UserId, usize)>>;
    /// I telefoni collegati di un utente.
    fn devices_of(&self, user: UserId, now: Timestamp) -> Result<Vec<DeviceSession>>;
    /// Scollega un telefono (`false`: non c'era).
    fn delete_device(&self, user: UserId, id: i64) -> Result<bool>;
}

/// Impostazioni del programma salvate nei dati (chiave → testo).
pub trait SettingsRepo {
    fn setting(&self, key: &str) -> Result<Option<String>>;
    /// `None`: la toglie.
    fn set_setting(&self, key: &str, value: Option<&str>) -> Result<()>;
}

// ---------------------------------------------------------------- macchina

/// Password e gettoni.
pub trait Security: Send + Sync {
    /// Impronta lenta di proposito (resiste ai tentativi a forza bruta).
    fn hash_password(&self, password: &str) -> String;
    fn verify_password(&self, password: &str, hash: &str) -> bool;
    /// Gettone casuale per il cookie di sessione (o per l'app).
    fn new_session_token(&self) -> String;
    fn session_key(&self, token: &str) -> SessionKey;
    /// Password temporanea facile da dettare (da cambiare al primo accesso).
    fn temp_password(&self) -> String;
}

pub trait Clock: Send + Sync {
    fn now(&self) -> Timestamp;
    /// Adesso, all'ora italiana.
    fn local_now(&self) -> DateTime;
    /// Il giorno di oggi, all'ora italiana.
    fn today(&self) -> Date {
        self.local_now().date()
    }
    /// L'istante di un'ora italiana (col cambio dell'ora: la prima delle due, o subito dopo il buco).
    fn instant_of(&self, local: DateTime) -> Timestamp;
}

/// La macchina su cui gira SApp.
pub trait Host: Send + Sync {
    fn os_name(&self) -> String;
    fn hostname(&self) -> String;
}

/// Il file di configurazione.
pub trait ConfigFile: Send + Sync {
    fn path(&self) -> String;
    /// Com'è adesso nel file (anche modifiche fatte a mano), se si riesce a leggere.
    fn read(&self) -> Option<ServerConfig>;
}

/// Stato degli aggiornamenti.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpdateStatus {
    /// cartella degli aggiornamenti presente (install.sh già lanciato una volta)
    pub available: bool,
    /// aggiornatore di sistema (root) installato
    pub helper: bool,
    /// versione caricata e pronta da installare
    pub staged: Option<String>,
    /// installazione richiesta o in corso
    pub pending: bool,
    /// esito dell'ultima operazione ("ok …", "err …", "rollback …")
    pub result: Option<String>,
    /// si installano solo pacchetti firmati
    pub signing: bool,
}

/// Pacchetto caricato e controllato.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Staged {
    pub version: String,
    pub size: usize,
    /// firma controllata (false: firma non attiva in questo programma)
    pub signed: bool,
    /// la versione caricata non è più nuova di quella installata
    pub older: bool,
}

/// Aggiornamenti dalla pagina: il programma prepara, l'aggiornatore di sistema (root) installa.
pub trait Updater: Send + Sync {
    fn status(&self) -> UpdateStatus;
    /// Registro dell'installazione da `from` in poi, e la sua lunghezza totale.
    fn log_from(&self, from: usize) -> (String, usize);
    /// Controlla e prepara un pacchetto caricato.
    fn stage(&self, zip: Vec<u8>) -> Result<Staged>;
    /// Chiede all'aggiornatore di installare il pacchetto preparato.
    fn apply(&self) -> Result<()>;
    /// Toglie il pacchetto preparato.
    fn cancel(&self);
    /// Chiede all'aggiornatore di installare questa configurazione (e riavviare).
    fn request_config(&self, cfg: &ServerConfig) -> Result<()>;
    /// C'è già una richiesta per l'aggiornatore.
    fn busy(&self) -> bool;
    /// File temporaneo per le copie (es. del database).
    fn temp_file(&self, name: &str) -> PathBuf;
}

/// L'app Android installata col pacchetto (da scaricare dal telefono).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ApkInfo {
    /// "2.0"
    pub version: String,
    pub size: u64,
    /// nome del file da scaricare
    pub file_name: String,
}

pub trait AppPackage: Send + Sync {
    fn info(&self) -> Option<ApkInfo>;
    fn read(&self) -> Result<Vec<u8>>;
}
