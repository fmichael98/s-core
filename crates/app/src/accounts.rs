//! Accesso (dal browser e dall'app Android), sessioni, password e profilo di chi è collegato.

use std::net::IpAddr;

use sapp_domain::{
    Error, Result,
    time::{Duration, Timestamp},
    user::{AvatarColor, DisplayName, Role, User, Username, check_new_password},
};

use crate::{
    App,
    ports::{DeviceSession, NewUser, tx},
};

/// Esito di un tentativo di accesso.
#[derive(Debug, PartialEq, Eq)]
pub enum Login {
    /// entrato: gettone (per il cookie o per l'app), pagina da aprire, durata
    Ok { token: String, home: &'static str, ttl: Duration },
    /// nome o password sbagliati (o utente disattivato); `locked`: con questo è scattato il blocco
    Wrong { locked: bool, lock_minutes: u32 },
    /// troppi tentativi sbagliati da questo indirizzo
    Locked { minutes: u32 },
}

/// Ogni quanto si aggiorna «ultima volta visto» di una sessione (non a ogni richiesta).
const TOUCH_EVERY: Duration = Duration::minutes(5);
/// Un telefono resta collegato finché lo si usa almeno una volta all'anno.
pub const DEVICE_TTL: Duration = Duration::days(365);

impl App {
    /// Primo avvio: se non c'è nessun utente crea gli amministratori. `legacy`: quelli di una versione di prima
    /// dell'app (nome e impronta della password, così si entra come prima); se non ci sono, quello della configurazione.
    /// I nomi degli amministratori creati.
    pub fn bootstrap_admin(&self, legacy: &[(String, String)]) -> Result<Vec<Username>> {
        let cfg = self.config();
        let now = self.ports.clock.now();
        tx(self.db(), |r| {
            if !r.users()?.is_empty() {
                return Ok(vec![]);
            }
            let mut admins: Vec<(Username, String)> =
                legacy.iter().filter(|(_, h)| h.starts_with("$argon2")).filter_map(|(n, h)| Username::parse(n).ok().map(|u| (u, h.clone()))).collect();
            if admins.is_empty() {
                if cfg.password_hash.is_empty() {
                    return Err(Error::invalid("manca password_hash nel config: lancia install.sh"));
                }
                admins.push((Username::parse(&cfg.username)?, cfg.password_hash.clone()));
            }
            for (username, pass_hash) in &admins {
                r.insert_user(&NewUser {
                    username: username.clone(),
                    display_name: DisplayName::default(),
                    color: AvatarColor::DEFAULT,
                    role: Role::Admin,
                    pass_hash: pass_hash.clone(),
                    must_change: false,
                    created: now,
                })?;
            }
            Ok(admins.into_iter().map(|(u, _)| u).collect())
        })
    }

    /// Tentativo di accesso da `ip`. `device`: nome del telefono se entra l'app Android (la sessione dura finché la
    /// si usa). La verifica della password è lenta di proposito: va chiamato fuori dai thread del server web.
    pub fn login(&self, username: &str, password: &str, ip: IpAddr, agent: &str, device: Option<&str>) -> Result<Login> {
        let cfg = self.config();
        let now = self.ports.clock.now();
        let throttle = || self.throttle.lock().unwrap_or_else(|e| e.into_inner());
        if throttle().is_locked(ip, now, cfg.max_fails, cfg.lock()) {
            return Ok(Login::Locked { minutes: cfg.lock_minutes });
        }
        let found = match Username::parse(username) {
            Ok(name) => tx(self.db(), |r| match r.user_by_name(&name)? {
                Some(u) => Ok(r.password_hash(u.id)?.map(|h| (u, h))),
                None => Ok(None),
            })?,
            Err(_) => None,
        };
        // stesso lavoro anche per chi non esiste (vedi `dummy_hash`)
        let hash = found.as_ref().map_or(self.dummy_hash.as_str(), |(_, h)| h.as_str());
        let ok = self.ports.security.verify_password(password, hash);
        let user = match found {
            Some((u, _)) if ok && !u.disabled => u,
            _ => {
                let n = throttle().fail(ip, now);
                return Ok(Login::Wrong { locked: n >= cfg.max_fails, lock_minutes: cfg.lock_minutes });
            }
        };
        if device.is_some() && user.role == Role::Admin {
            return Err(Error::forbidden("L'app è per gli utenti: l'amministratore gestisce solo il server."));
        }
        throttle().clear(ip);
        let token = self.ports.security.new_session_token();
        let key = self.ports.security.session_key(&token);
        let ttl = if device.is_some() { DEVICE_TTL } else { cfg.session_ttl() };
        let device =
            device.map(|d| d.trim().chars().filter(|c| !c.is_control()).take(60).collect::<String>()).map(|d| if d.is_empty() { "Telefono".into() } else { d });
        tx(self.db(), |r| {
            r.insert_session(&key, user.id, now, now.plus(ttl), agent, device.as_deref())?;
            r.set_last_login(user.id, now)
        })?;
        let home = if user.must_change { "/password" } else { user.role.home() };
        Ok(Login::Ok { token, home, ttl })
    }

    /// Utente della sessione con questo gettone, se è aperta (e l'utente può ancora entrare).
    pub fn session_user(&self, token: &str, agent: &str) -> Result<Option<User>> {
        let key = self.ports.security.session_key(token);
        let now = self.ports.clock.now();
        tx(self.db(), |r| {
            let Some(s) = r.session(&key)? else { return Ok(None) };
            if s.expires <= now {
                r.delete_session(&key)?;
                return Ok(None);
            }
            let Some(user) = r.user(s.user)?.filter(|u| !u.disabled) else { return Ok(None) };
            if now.since(s.last_seen) >= TOUCH_EVERY {
                // i telefoni restano collegati finché si usano
                let renew = s.device.is_some().then(|| now.plus(DEVICE_TTL));
                r.touch_session(&key, now, agent, renew)?;
            }
            Ok(Some(user))
        })
    }

    pub fn logout(&self, token: &str) -> Result<()> {
        let key = self.ports.security.session_key(token);
        tx(self.db(), |r| r.delete_session(&key))
    }

    /// Cambio password: le altre sessioni dell'utente si chiudono (telefoni compresi), quella da cui lo fa
    /// (`keep_token`) resta.
    pub fn change_password(&self, user: &User, current: &str, new: &str, keep_token: &str) -> Result<()> {
        let hash = tx(self.db(), |r| r.password_hash(user.id))?.ok_or_else(|| Error::not_found("utente non trovato"))?;
        if !self.ports.security.verify_password(current, &hash) {
            return Err(Error::forbidden("La password attuale non è corretta."));
        }
        check_new_password(&user.username, current, new)?;
        let new_hash = self.ports.security.hash_password(new);
        let keep = self.ports.security.session_key(keep_token);
        tx(self.db(), |r| {
            r.set_password(user.id, &new_hash, false)?;
            r.delete_sessions_of(user.id, Some(&keep))
        })
    }

    /// Nome mostrato e colore di chi è collegato.
    pub fn update_profile(&self, user: &User, display_name: &str, color: &str) -> Result<User> {
        let name = DisplayName::parse(display_name)?;
        let color = AvatarColor::parse(color)?;
        tx(self.db(), |r| {
            r.set_profile(user.id, &name, color)?;
            r.user(user.id)?.ok_or_else(|| Error::not_found("utente non trovato"))
        })
    }

    /// I telefoni collegati con l'app.
    pub fn devices(&self, user: &User) -> Result<Vec<DeviceSession>> {
        let now = self.ports.clock.now();
        tx(self.db(), |r| r.devices_of(user.id, now))
    }

    /// Scollega un telefono: l'app dovrà rifare l'accesso.
    pub fn remove_device(&self, user: &User, id: i64) -> Result<()> {
        if tx(self.db(), |r| r.delete_device(user.id, id))? { Ok(()) } else { Err(Error::not_found("Telefono non trovato.")) }
    }

    /// Per l'emergenza (da terminale): password temporanea nuova, da cambiare al primo accesso.
    pub fn reset_password_by_name(&self, username: &str) -> Result<String> {
        let name = Username::parse(username)?;
        let temp = self.ports.security.temp_password();
        let hash = self.ports.security.hash_password(&temp);
        tx(self.db(), |r| {
            let u = r.user_by_name(&name)?.ok_or_else(|| Error::not_found(format!("utente «{name}» non trovato")))?;
            r.set_password(u.id, &hash, true)?;
            r.set_disabled(u.id, false)?;
            r.delete_sessions_of(u.id, None)
        })?;
        Ok(temp)
    }

    /// Pulizia periodica: via le sessioni scadute; quante.
    pub fn purge_sessions(&self) -> Result<usize> {
        let now: Timestamp = self.ports.clock.now();
        tx(self.db(), |r| r.delete_expired_sessions(now))
    }
}
