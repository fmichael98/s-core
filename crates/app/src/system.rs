//! Amministrazione del server: configurazione, stato, copia del database, aggiornamenti.
//!
//! La configurazione sta in un file che il programma legge ma non può scrivere: salvando si prepara quella nuova e
//! l'aggiornatore di sistema (root) la installa, aggiorna Caddy e riavvia (se SApp non riparte rimette la
//! precedente).

use std::{collections::HashMap, path::Path};

use sapp_domain::{Error, Result, user::User};

use crate::{
    App,
    config::{FIELDS, Field, FieldKind, ServerConfig},
    ports::{Staged, UpdateStatus, tx},
};

/// Un campo della configurazione per il pannello.
#[derive(Clone, Debug)]
pub struct FieldView {
    pub field: &'static Field,
    /// nel file
    pub value: String,
    /// in uso adesso (diverso dal file finché non si riavvia)
    pub running: String,
}

#[derive(Clone, Debug)]
pub struct ConfigView {
    pub path: String,
    /// file leggibile (altrimenti si mostra quella in uso)
    pub readable: bool,
    /// aggiornatore di sistema installato (serve per salvare)
    pub helper: bool,
    pub public_url: Option<String>,
    pub fields: Vec<FieldView>,
}

/// Esito del salvataggio.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ConfigSaved {
    pub changed: Vec<String>,
    /// la pagina si sposta su questa porta
    pub new_port: Option<u16>,
}

#[derive(Clone, Debug)]
pub struct SystemInfo {
    pub version: &'static str,
    pub os: String,
    pub hostname: String,
    pub database: String,
    pub db_size: u64,
    pub users: usize,
    pub sessions: usize,
    pub update: UpdateStatus,
}

impl App {
    pub fn config_view(&self) -> ConfigView {
        let running = self.config();
        let file = self.ports.config_file.read();
        let shown = file.clone().unwrap_or_else(|| running.clone());
        ConfigView {
            path: self.ports.config_file.path(),
            readable: file.is_some(),
            helper: self.ports.updater.status().helper,
            public_url: shown.public_url(),
            fields: FIELDS.iter().map(|f| FieldView { field: f, value: shown.value_of(f.key), running: running.value_of(f.key) }).collect(),
        }
    }

    /// Salva la configurazione (con la password di chi la cambia) e fa riavviare SApp.
    /// `port_free`: la porta della rete locale nuova si può usare su questo server.
    pub fn save_config(
        &self,
        actor: &User,
        password: &str,
        values: &HashMap<String, String>,
        port_free: impl Fn(&ServerConfig) -> Result<()>,
    ) -> Result<ConfigSaved> {
        self.check_password(actor, password)?;
        let base = self.ports.config_file.read().unwrap_or_else(|| self.config());
        let mut next = base.clone();
        let mut changed = vec![];
        for f in FIELDS.iter().filter(|f| f.kind != FieldKind::ReadOnly) {
            let Some(raw) = values.get(f.key) else { continue };
            next.set(f, raw)?;
            let (before, after) = (base.value_of(f.key), next.value_of(f.key));
            if before != after {
                changed.push(format!("{}: {before} → {after}", f.key));
            }
        }
        if changed.is_empty() {
            return Ok(ConfigSaved { changed, new_port: None });
        }
        next.check()?;
        if next.bind != self.config().bind {
            port_free(&next)?;
        }
        let up = &self.ports.updater;
        if !up.status().helper {
            return Err(Error::conflict("Aggiornatore di sistema non installato: lancia una volta sudo ./install.sh da SSH."));
        }
        if up.busy() {
            return Err(Error::conflict("C'è già un'operazione in corso: riprova tra poco."));
        }
        up.request_config(&next)?;
        let new_port = (next.bind != base.bind).then_some(next.lan_port());
        Ok(ConfigSaved { changed, new_port })
    }

    pub fn system_info(&self) -> Result<SystemInfo> {
        let now = self.ports.clock.now();
        let (users, sessions) = tx(self.db(), |r| Ok((r.users()?.len(), r.sessions_per_user(now)?.iter().map(|(_, n)| n).sum())))?;
        Ok(SystemInfo {
            version: self.version,
            os: self.ports.host.os_name(),
            hostname: self.ports.host.hostname(),
            database: self.db().location(),
            db_size: self.db().size_bytes(),
            users,
            sessions,
            update: self.ports.updater.status(),
        })
    }

    /// Copia coerente del database, letta in memoria (senza i codici delle app collegate né le sessioni).
    pub fn database_copy(&self) -> Result<Vec<u8>> {
        let tmp = self.ports.updater.temp_file(&format!("sapp-copia-{}.db", self.ports.clock.now().secs()));
        let out = self.db().backup_to(&tmp).and_then(|()| read(&tmp));
        let _ = std::fs::remove_file(&tmp);
        out
    }

    pub fn update_status(&self) -> UpdateStatus {
        self.ports.updater.status()
    }
    pub fn update_log(&self, from: usize) -> (String, usize) {
        self.ports.updater.log_from(from)
    }
    pub fn stage_update(&self, zip: Vec<u8>) -> Result<Staged> {
        self.ports.updater.stage(zip)
    }
    pub fn apply_update(&self) -> Result<()> {
        self.ports.updater.apply()
    }
    pub fn cancel_update(&self) {
        self.ports.updater.cancel()
    }

    /// Le operazioni delicate chiedono di nuovo la password.
    fn check_password(&self, user: &User, password: &str) -> Result<()> {
        let hash = tx(self.db(), |r| r.password_hash(user.id))?.unwrap_or_default();
        if self.ports.security.verify_password(password, &hash) { Ok(()) } else { Err(Error::forbidden("Password non corretta.")) }
    }
}

fn read(p: &Path) -> Result<Vec<u8>> {
    std::fs::read(p).map_err(|e| Error::internal(format!("copia non riuscita: {e}")))
}
