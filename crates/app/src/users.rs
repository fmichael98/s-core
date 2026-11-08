//! Gestione degli utenti (amministratore).

use std::collections::HashMap;

use sapp_domain::{
    Error, Result,
    user::{AvatarColor, DisplayName, Role, User, UserId, Username, check_can_remove, check_temporary_password},
};

use crate::{
    App,
    ports::{NewUser, Repos, tx},
};

/// Riga dell'elenco utenti.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UserSummary {
    pub user: User,
    /// sessioni aperte (browser e telefoni)
    pub sessions: usize,
    /// dati suoi (veicoli, calendari…): li conta l'app, per l'elenco e per l'avviso prima di eliminarlo
    pub items: usize,
}

fn existing(r: &dyn Repos, id: UserId) -> Result<User> {
    r.user(id)?.ok_or_else(|| Error::not_found("utente non trovato"))
}

fn admins(r: &dyn Repos) -> Result<usize> {
    Ok(r.users()?.iter().filter(|u| u.role == Role::Admin && !u.disabled).count())
}

impl App {
    pub fn list_users(&self) -> Result<Vec<UserSummary>> {
        let now = self.ports.clock.now();
        tx(self.db(), |r| {
            let sessions: HashMap<UserId, usize> = r.sessions_per_user(now)?.into_iter().collect();
            // l'app qui conta i dati di ognuno (es. `r.vehicles_per_user()`)
            let items: HashMap<UserId, usize> = HashMap::new();
            let count = |m: &HashMap<UserId, usize>, id| m.get(&id).copied().unwrap_or(0);
            Ok(r.users()?.into_iter().map(|u| UserSummary { sessions: count(&sessions, u.id), items: count(&items, u.id), user: u }).collect())
        })
    }

    /// Nuovo utente: la prima password è uguale al nome utente, da cambiare al primo accesso. (Se l'app vuole dei
    /// dati iniziali per ogni utente, es. un primo calendario, li crea qui nella stessa transazione.)
    pub fn create_user(&self, username: &str, display_name: &str, role: Role) -> Result<(UserId, Username)> {
        let username = Username::parse(username)?;
        let display_name = DisplayName::parse(display_name)?;
        let pass_hash = self.ports.security.hash_password(username.as_str());
        let created = self.ports.clock.now();
        let id = tx(self.db(), |r| {
            if r.user_by_name(&username)?.is_some() {
                return Err(Error::conflict(format!("Il nome utente «{username}» esiste già.")));
            }
            // colori diversi tra gli utenti (gli amministratori non usano l'app e non si vedono)
            let used: Vec<AvatarColor> = r.users()?.iter().filter(|u| u.role == Role::Member).map(|u| u.color).collect();
            let id = r.insert_user(&NewUser {
                username: username.clone(),
                display_name: display_name.clone(),
                color: AvatarColor::least_used(&used),
                role,
                pass_hash,
                must_change: true,
                created,
            })?;
            Ok(id)
        })?;
        Ok((id, username))
    }

    /// Nome mostrato e colore di un utente.
    pub fn edit_user(&self, id: UserId, display_name: &str, color: &str) -> Result<()> {
        let name = DisplayName::parse(display_name)?;
        let color = AvatarColor::parse(color)?;
        tx(self.db(), |r| {
            existing(r, id)?;
            r.set_profile(id, &name, color)
        })
    }

    /// Password provvisoria scelta dall'amministratore, da cambiare al primo accesso: le sessioni aperte dell'utente
    /// (telefoni compresi) si chiudono.
    pub fn reset_password(&self, id: UserId, password: &str) -> Result<()> {
        check_temporary_password(password)?;
        let hash = self.ports.security.hash_password(password);
        tx(self.db(), |r| {
            existing(r, id)?;
            r.set_password(id, &hash, true)?;
            r.delete_sessions_of(id, None)
        })
    }

    /// Disattivato non entra più (le sue sessioni si chiudono); i dati restano.
    pub fn set_disabled(&self, actor: UserId, id: UserId, disabled: bool) -> Result<()> {
        tx(self.db(), |r| {
            let u = existing(r, id)?;
            if disabled {
                check_can_remove(actor, &u, admins(r)?)?;
                r.delete_sessions_of(id, None)?;
            }
            r.set_disabled(id, disabled)
        })
    }

    /// Elimina un utente: con lui se ne vanno i suoi dati (nel database: `ON DELETE CASCADE`).
    pub fn delete_user(&self, actor: UserId, id: UserId) -> Result<()> {
        tx(self.db(), |r| {
            let u = existing(r, id)?;
            check_can_remove(actor, &u, admins(r)?)?;
            r.delete_user(id)
        })
    }
}
