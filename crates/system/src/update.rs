//! Cartella degli aggiornamenti (/var/lib/sapp/update): il pannello prepara, l'aggiornatore di sistema (root)
//! installa.
//!
//! 1. stage: lo zip viene controllato (deve contenere il programma `sapp` che parte e dice la versione, e
//!    install.sh) e salvato in `pkg.zip`.
//! 2. apply: si crea `ready` con "pkg". Un'unità systemd .path (root) lancia apply-update.sh: estrae il pacchetto ed
//!    esegue il suo install.sh (copia del database, programma, Caddy, riavvio; se SApp non riparte torna alla
//!    versione precedente). Avanzamento in `update.log`, esito in `result`.
//! 3. configurazione: `config.new` + `ready` con "config" (vedi apply-update.sh).
//!
//! Firma: se il programma è stato compilato con `packaging/firma.pub`, uno zip si installa solo se contiene
//! `SHA256SUMS` (le impronte di tutti i suoi file) firmato in `SHA256SUMS.sig` con la chiave privata che sta nei
//! segreti di GitHub Actions. Lo controlla il pannello caricandolo e di nuovo l'aggiornatore (root) prima di
//! installarlo, con il programma già installato (`sapp verify-package`).

use std::{
    collections::BTreeMap,
    io::Read,
    path::{Path, PathBuf},
};

use sapp_app::{
    config::ServerConfig,
    ports::{Staged, UpdateStatus, Updater},
};
use sapp_domain::{Error, Result};

use crate::config_file;

include!(concat!(env!("OUT_DIR"), "/firma.rs"));

/// Nome del programma nel pacchetto.
const BIN: &str = "sapp";
/// Dimensione massima di un file dentro lo zip.
const MAX_FILE: u64 = 64 * 1024 * 1024;
/// Versione dell'aggiornatore di sistema che install.sh scrive in `.helper`.
pub const HELPER_VERSION: u32 = 3;

/// Pacchetti controllati: questo programma installa solo zip firmati.
pub fn signing_on() -> bool {
    FIRMA.is_some()
}

/// Controlla la firma dello zip, se è attiva: `Ok(true)` firmato e integro, `Ok(false)` firma non attiva.
pub fn verify_package(data: &[u8]) -> Result<bool> {
    match FIRMA {
        Some(pem) => verify_with(data, pem).map(|()| true),
        None => Ok(false),
    }
}

/// File del pacchetto (nome → contenuto), nella radice o nella cartella principale; niente cartelle più in basso né
/// collegamenti.
fn package_files(data: &[u8]) -> Result<BTreeMap<String, Vec<u8>>> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(data)).map_err(|_| Error::invalid("il file non è uno zip valido"))?;
    let mut out = BTreeMap::new();
    for i in 0..zip.len() {
        let f = zip.by_index(i).map_err(|_| Error::invalid("zip danneggiato"))?;
        if f.is_dir() {
            continue;
        }
        let path = f.enclosed_name().ok_or_else(|| Error::invalid("nello zip c'è un percorso non valido"))?;
        if f.is_symlink() || path.components().count() > 2 {
            return Err(Error::invalid("lo zip non è fatto come i pacchetti delle Releases"));
        }
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        if f.size() > MAX_FILE {
            return Err(Error::invalid(format!("{name} è troppo grande")));
        }
        let mut buf = Vec::new();
        f.take(MAX_FILE).read_to_end(&mut buf).map_err(|_| Error::invalid("estrazione fallita"))?;
        if out.insert(name.clone(), buf).is_some() {
            return Err(Error::invalid(format!("nello zip c'è due volte {name}")));
        }
    }
    Ok(out)
}

/// La firma di `SHA256SUMS` è della chiave `pem` e ogni file dello zip è proprio quello firmato (né in più né in meno).
fn verify_with(data: &[u8], pem: &str) -> Result<()> {
    use ed25519_dalek::{Signature, VerifyingKey, pkcs8::DecodePublicKey};
    use sha2::{Digest, Sha256};
    let key = VerifyingKey::from_public_key_pem(pem.trim()).map_err(|_| Error::internal("chiave della firma non valida in questo programma"))?;
    let mut files = package_files(data)?;
    let (Some(sums), Some(sig)) = (files.remove("SHA256SUMS"), files.remove("SHA256SUMS.sig")) else {
        return Err(Error::invalid("pacchetto non firmato: usa lo zip delle Releases di s-app"));
    };
    let sig = Signature::from_slice(&sig).map_err(|_| Error::invalid("firma del pacchetto non valida"))?;
    key.verify_strict(&sums, &sig).map_err(|_| Error::invalid("firma del pacchetto non valida: non viene da GitHub Actions di s-app"))?;
    // righe di sha256sum: "<impronta>  <nome>" (o "<impronta> *<nome>")
    let mut listed = BTreeMap::new();
    for line in String::from_utf8_lossy(&sums).lines().filter(|l| !l.trim().is_empty()) {
        let (hash, name) = line.split_once(' ').ok_or_else(|| Error::invalid("elenco delle impronte non valido"))?;
        listed.insert(name.trim_start_matches([' ', '*']).to_string(), hash.to_ascii_lowercase());
    }
    if !listed.keys().eq(files.keys()) {
        return Err(Error::invalid("nel pacchetto ci sono file diversi da quelli firmati"));
    }
    for (name, body) in &files {
        let hash: String = Sha256::digest(body).iter().map(|b| format!("{b:02x}")).collect();
        if listed.get(name) != Some(&hash) {
            return Err(Error::invalid(format!("{name} è stato cambiato dopo la firma")));
        }
    }
    Ok(())
}

/// Cerca nello zip il programma `sapp` (in radice o nella cartella principale) e controlla che ci sia install.sh.
fn binary_in_package(data: &[u8]) -> Result<Vec<u8>> {
    let mut files = package_files(data)?;
    if !files.contains_key("install.sh") {
        return Err(Error::invalid("nello zip manca install.sh: usa il pacchetto delle Releases (sapp-vX.Y.Z.zip)"));
    }
    let bin = files.remove(BIN).ok_or_else(|| Error::invalid("nello zip non c'è il programma sapp: è il pacchetto giusto (sapp-vX.Y.Z.zip)?"))?;
    if !bin.starts_with(b"\x7fELF") {
        return Err(Error::invalid("il file sapp nello zip non è un eseguibile Linux"));
    }
    Ok(bin)
}

/// `a` è una versione più nuova di `b` ("2.57.0" > "2.56.3"); versioni non leggibili: no.
fn newer(a: &str, b: &str) -> bool {
    let n = |v: &str| v.split('.').map(|x| x.parse::<u64>().ok()).collect::<Option<Vec<u64>>>();
    matches!((n(a), n(b)), (Some(x), Some(y)) if x > y)
}

#[cfg(unix)]
fn make_executable(p: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(p, std::fs::Permissions::from_mode(0o755));
}
#[cfg(not(unix))]
fn make_executable(_: &Path) {}

/// Fa partire il programma con `--version`: "sapp X.Y.Z" → "X.Y.Z".
fn version_of_binary(p: &Path) -> Option<String> {
    let out = std::process::Command::new(p).arg("--version").output().ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout).trim().strip_prefix("sapp ").map(str::to_string)
}

pub struct UpdateArea {
    dir: PathBuf,
    current: &'static str,
}

impl UpdateArea {
    pub fn new(dir: PathBuf, current: &'static str) -> Self {
        UpdateArea { dir, current }
    }

    /// Da `SAPP_UPDATE_DIR`, altrimenti /var/lib/sapp/update.
    pub fn from_env(current: &'static str) -> Self {
        Self::new(std::env::var("SAPP_UPDATE_DIR").unwrap_or_else(|_| "/var/lib/sapp/update".into()).into(), current)
    }

    fn file(&self, name: &str) -> PathBuf {
        self.dir.join(name)
    }

    fn available(&self) -> bool {
        self.dir.is_dir()
    }

    fn helper_ok(&self) -> bool {
        std::fs::read_to_string(self.file(".helper")).is_ok_and(|s| s.trim().parse::<u32>().unwrap_or(0) >= HELPER_VERSION)
    }

    fn request(&self, what: &str) -> std::io::Result<()> {
        let _ = std::fs::remove_file(self.file("result"));
        let _ = std::fs::write(self.file("update.log"), "");
        std::fs::write(self.file("ready"), format!("{what}\n"))
    }
}

impl Updater for UpdateArea {
    fn status(&self) -> UpdateStatus {
        UpdateStatus {
            available: self.available(),
            helper: self.helper_ok(),
            staged: std::fs::read_to_string(self.file("staged.version")).ok().filter(|_| self.file("pkg.zip").exists()),
            pending: self.busy() || self.file("running").exists(),
            result: std::fs::read_to_string(self.file("result")).ok().map(|s| s.trim().to_string()),
            signing: signing_on(),
        }
    }

    fn log_from(&self, from: usize) -> (String, usize) {
        let log = std::fs::read_to_string(self.file("update.log")).unwrap_or_default();
        let from = (0..=from.min(log.len())).rev().find(|i| log.is_char_boundary(*i)).unwrap_or(0);
        (log[from..].to_string(), log.len())
    }

    fn stage(&self, data: Vec<u8>) -> Result<Staged> {
        if !self.available() {
            return Err(Error::unavailable("aggiornamento web non installato: lancia install.sh una volta da SSH"));
        }
        // prima la firma (se attiva): il programma dello zip si fa partire solo se è quello firmato
        let signed = verify_package(&data)?;
        let bin = binary_in_package(&data)?;
        for f in ["ready", "result", "pkg.zip", "sapp.new", "staged.version"] {
            let _ = std::fs::remove_file(self.file(f));
        }
        let new = self.file("sapp.new");
        std::fs::write(&new, &bin).map_err(|e| Error::internal(format!("scrittura fallita: {e}")))?;
        make_executable(&new);
        let version = version_of_binary(&new);
        let _ = std::fs::remove_file(&new);
        let version = version.ok_or_else(|| Error::invalid("il programma nello zip non parte su questo server (versione Ubuntu diversa?)"))?;
        std::fs::write(self.file("pkg.zip"), &data).map_err(|e| Error::internal(format!("scrittura fallita: {e}")))?;
        let _ = std::fs::write(self.file("staged.version"), &version);
        let older = !newer(&version, self.current);
        Ok(Staged { version, size: data.len(), signed, older })
    }

    fn apply(&self) -> Result<()> {
        if !self.file("pkg.zip").exists() {
            return Err(Error::invalid("nessun aggiornamento caricato"));
        }
        if self.file("running").exists() {
            return Err(Error::conflict("c'è già un'operazione in corso"));
        }
        self.request("pkg").map_err(|e| Error::internal(format!("impossibile avviare l'aggiornamento: {e}")))
    }

    fn cancel(&self) {
        for f in ["sapp.new", "pkg.zip", "staged.version", "ready", "result"] {
            let _ = std::fs::remove_file(self.file(f));
        }
    }

    fn request_config(&self, cfg: &ServerConfig) -> Result<()> {
        std::fs::write(self.file("config.new"), config_file::render(cfg)).map_err(|e| Error::internal(format!("scrittura non riuscita: {e}")))?;
        self.request("config").map_err(|e| Error::internal(format!("avvio non riuscito: {e}")))
    }

    fn busy(&self) -> bool {
        self.file("ready").exists()
    }

    fn temp_file(&self, name: &str) -> PathBuf {
        if self.available() { self.file(name) } else { std::env::temp_dir().join(name) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn zip_with(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut w = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, body) in files {
            w.start_file(*name, zip::write::SimpleFileOptions::default()).unwrap();
            w.write_all(body).unwrap();
        }
        w.finish().unwrap().into_inner()
    }

    #[test]
    fn pacchetto() {
        let ok = zip_with(&[("sapp-v0.2.0/sapp", b"\x7fELF..."), ("sapp-v0.2.0/install.sh", b"#!")]);
        assert_eq!(binary_in_package(&ok).unwrap(), b"\x7fELF...");
        assert!(binary_in_package(&zip_with(&[("sapp", b"\x7fELF")])).unwrap_err().msg.contains("install.sh"));
        assert!(binary_in_package(&zip_with(&[("sapp", b"MZ"), ("install.sh", b"#!")])).unwrap_err().msg.contains("Linux"));
        assert!(binary_in_package(&zip_with(&[("a/b/sapp", b"\x7fELF"), ("install.sh", b"#!")])).is_err());
        assert!(binary_in_package(b"non zip").is_err());
    }

    #[test]
    fn versioni() {
        assert!(newer("0.2.0", "0.1.9") && newer("1.0.0", "0.99.99") && newer("0.10.0", "0.9.0"));
        assert!(!newer("0.1.0", "0.1.0") && !newer("0.0.9", "0.1.0") && !newer("boh", "0.1.0"));
    }

    #[test]
    fn firma() {
        use ed25519_dalek::{Signer, SigningKey, pkcs8::EncodePublicKey};
        use sha2::{Digest, Sha256};
        let key = SigningKey::from_bytes(&[7u8; 32]);
        let pem = key.verifying_key().to_public_key_pem(Default::default()).unwrap();
        let other = SigningKey::from_bytes(&[8u8; 32]).verifying_key().to_public_key_pem(Default::default()).unwrap();
        let files: [(&str, &[u8]); 2] = [("sapp", b"\x7fELF..."), ("install.sh", b"#!/bin/sh")];
        let sums: String = files.iter().map(|(n, b)| format!("{}  {n}\n", Sha256::digest(b).iter().map(|x| format!("{x:02x}")).collect::<String>())).collect();
        let sig = key.sign(sums.as_bytes()).to_bytes();
        let pkg = |extra: &[(&str, &[u8])]| {
            let mut all: Vec<(String, Vec<u8>)> = files.iter().map(|(n, b)| (format!("sapp-v9/{n}"), b.to_vec())).collect();
            all.push(("sapp-v9/SHA256SUMS".into(), sums.as_bytes().to_vec()));
            all.push(("sapp-v9/SHA256SUMS.sig".into(), sig.to_vec()));
            all.extend(extra.iter().map(|(n, b)| (n.to_string(), b.to_vec())));
            let refs: Vec<(&str, &[u8])> = all.iter().map(|(n, b)| (n.as_str(), b.as_slice())).collect();
            zip_with(&refs)
        };
        assert!(verify_with(&pkg(&[]), &pem).is_ok());
        assert!(verify_with(&pkg(&[]), &other).unwrap_err().msg.contains("firma"));
        assert!(verify_with(&pkg(&[("sapp-v9/altro.sh", b"x")]), &pem).unwrap_err().msg.contains("diversi"));
        let changed = zip_with(&[
            ("sapp-v9/sapp", b"\x7fELF!!!"),
            ("sapp-v9/install.sh", b"#!/bin/sh"),
            ("sapp-v9/SHA256SUMS", sums.as_bytes()),
            ("sapp-v9/SHA256SUMS.sig", &sig),
        ]);
        assert!(verify_with(&changed, &pem).unwrap_err().msg.contains("cambiato"));
        assert!(verify_with(&zip_with(&files), &pem).unwrap_err().msg.contains("non firmato"));
    }

    #[test]
    fn cartella() {
        let dir = std::env::temp_dir().join(format!("sapp-update-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let area = UpdateArea::new(dir.clone(), "0.1.0");
        assert!(!area.status().available);
        assert!(area.stage(vec![]).is_err());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(".helper"), "3").unwrap();
        assert!(area.status().helper && !area.busy());
        area.request_config(&ServerConfig::default()).unwrap();
        assert!(area.busy() && area.status().pending);
        let port = sapp_app::config::DEFAULT_LAN_PORT;
        assert!(std::fs::read_to_string(dir.join("config.new")).unwrap().contains(&format!("bind = \"0.0.0.0:{port}\"")));
        std::fs::write(dir.join("update.log"), "riga uno\nriga due\n").unwrap();
        assert_eq!(area.log_from(9), ("riga due\n".to_string(), 18));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
