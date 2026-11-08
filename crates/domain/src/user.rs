//! Utenti: nome utente, nome mostrato, colore dell'avatar, ruolo, regole delle password.

use std::fmt;

use crate::{Error, Result, time::Timestamp};

/// Identificativo di un utente.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct UserId(pub i64);

impl fmt::Display for UserId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

/// Ruolo: l'amministratore gestisce solo utenti, configurazione e aggiornamenti (niente dati suoi);
/// gli utenti usano l'app (i loro dati e quelli condivisi con loro).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Role {
    Admin,
    Member,
}

impl Role {
    pub const fn as_str(self) -> &'static str {
        match self {
            Role::Admin => "admin",
            Role::Member => "member",
        }
    }
    pub fn parse(s: &str) -> Result<Role> {
        match s {
            "admin" => Ok(Role::Admin),
            "member" => Ok(Role::Member),
            _ => Err(Error::invalid(format!("ruolo sconosciuto: {s}"))),
        }
    }
    /// Pagina da cui si parte dopo l'accesso.
    pub const fn home(self) -> &'static str {
        match self {
            Role::Admin => "/admin",
            Role::Member => "/",
        }
    }
}

/// Nome utente valido: 2–32 caratteri tra lettere minuscole, numeri, punto, trattino e _.
/// Si scrive come si vuole, si salva in minuscolo (Mario.Rossi → mario.rossi).
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Username(String);

impl Username {
    pub fn parse(s: &str) -> Result<Username> {
        let u = s.trim().to_ascii_lowercase();
        let ok = (2..=32).contains(&u.len()) && u.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "._-".contains(c));
        if ok { Ok(Username(u)) } else { Err(Error::invalid("Nome utente: da 2 a 32 caratteri tra lettere, numeri, punto, trattino e _.")) }
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for Username {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

/// Nome mostrato: senza spazi ai lati, al massimo 40 caratteri, senza caratteri di controllo. Può essere vuoto
/// (si mostra il nome utente).
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct DisplayName(String);

impl DisplayName {
    pub const MAX: usize = 40;
    pub fn parse(s: &str) -> Result<DisplayName> {
        let n = s.trim();
        if n.chars().any(char::is_control) {
            return Err(Error::invalid("Il nome contiene caratteri non ammessi."));
        }
        if n.chars().count() > Self::MAX {
            return Err(Error::invalid(format!("Il nome può avere al massimo {} caratteri.", Self::MAX)));
        }
        Ok(DisplayName(n.to_string()))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Colore dell'avatar (le tinte della pagina, giuste in tema chiaro e scuro).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum AvatarColor {
    Rose,
    Orange,
    Yellow,
    Lime,
    Green,
    Sky,
    Blue,
    Violet,
    Fuchsia,
}

impl AvatarColor {
    pub const ALL: [AvatarColor; 9] = [
        AvatarColor::Rose,
        AvatarColor::Orange,
        AvatarColor::Yellow,
        AvatarColor::Lime,
        AvatarColor::Green,
        AvatarColor::Sky,
        AvatarColor::Blue,
        AvatarColor::Violet,
        AvatarColor::Fuchsia,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            AvatarColor::Rose => "rose",
            AvatarColor::Orange => "orange",
            AvatarColor::Yellow => "yellow",
            AvatarColor::Lime => "lime",
            AvatarColor::Green => "green",
            AvatarColor::Sky => "sky",
            AvatarColor::Blue => "blue",
            AvatarColor::Violet => "violet",
            AvatarColor::Fuchsia => "fuchsia",
        }
    }
    pub fn parse(s: &str) -> Result<AvatarColor> {
        AvatarColor::ALL.into_iter().find(|c| c.as_str() == s).ok_or_else(|| Error::invalid("Colore non valido."))
    }
    /// Colore di partenza: il viola dell'app.
    pub const DEFAULT: AvatarColor = AvatarColor::Violet;
    /// Colore per un utente nuovo: il primo tra i meno usati, partendo dal viola (così, finché si può, tutti diversi).
    pub fn least_used(used: &[AvatarColor]) -> AvatarColor {
        let count = |c: AvatarColor| used.iter().filter(|u| **u == c).count();
        let order = std::iter::once(AvatarColor::DEFAULT).chain(AvatarColor::ALL.into_iter().filter(|c| *c != AvatarColor::DEFAULT));
        order.min_by_key(|c| count(*c)).unwrap_or(AvatarColor::DEFAULT)
    }
}

/// Utente salvato.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct User {
    pub id: UserId,
    pub username: Username,
    pub display_name: DisplayName,
    pub color: AvatarColor,
    pub role: Role,
    /// deve cambiare la password prima di fare altro
    pub must_change: bool,
    /// non può più entrare
    pub disabled: bool,
    pub created: Timestamp,
    pub last_login: Option<Timestamp>,
}

impl User {
    /// Nome da mostrare: quello dato, altrimenti il nome utente.
    pub fn shown_name(&self) -> String {
        if self.display_name.is_empty() { self.username.to_string() } else { self.display_name.as_str().to_string() }
    }
}

/// Lunghezza minima delle password.
pub const MIN_PASSWORD: usize = 8;

/// Regole della nuova password (quella attuale è già stata verificata).
pub fn check_new_password(username: &Username, current: &str, new: &str) -> Result<()> {
    if new.chars().count() < MIN_PASSWORD {
        return Err(Error::invalid(format!("La nuova password deve avere almeno {MIN_PASSWORD} caratteri.")));
    }
    if new.eq_ignore_ascii_case(username.as_str()) || new == current {
        return Err(Error::invalid("Scegli una password diversa da quella attuale e dal nome utente."));
    }
    Ok(())
}

/// Password provvisoria scelta dall'amministratore (va cambiata al primo accesso, quindi niente regole di lunghezza):
/// non vuota, al massimo 128 caratteri, senza caratteri di controllo.
pub fn check_temporary_password(p: &str) -> Result<()> {
    if p.is_empty() || p.chars().count() > 128 || p.chars().any(char::is_control) {
        return Err(Error::invalid("Password: da 1 a 128 caratteri, senza a capo."));
    }
    Ok(())
}

/// Un utente non può togliere di mezzo sé stesso né l'ultimo amministratore.
pub fn check_can_remove(actor: UserId, target: &User, admins: usize) -> Result<()> {
    if target.id == actor {
        return Err(Error::invalid("Non puoi eliminare o disattivare te stesso."));
    }
    if target.role == Role::Admin && admins <= 1 {
        return Err(Error::invalid("Serve almeno un amministratore."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user(id: i64, role: Role) -> User {
        User {
            id: UserId(id),
            username: Username::parse("mario.rossi").unwrap(),
            display_name: DisplayName::default(),
            color: AvatarColor::Blue,
            role,
            must_change: false,
            disabled: false,
            created: Timestamp(0),
            last_login: None,
        }
    }

    #[test]
    fn nomi_utente() {
        assert_eq!(Username::parse("  Mario.Rossi ").unwrap().as_str(), "mario.rossi");
        assert!(Username::parse("m").is_err());
        assert!(Username::parse("con spazio").is_err());
        assert!(Username::parse("àccento").is_err());
        assert!(Username::parse(&"a".repeat(33)).is_err());
    }

    #[test]
    fn nome_mostrato() {
        assert_eq!(DisplayName::parse("  Mario  ").unwrap().as_str(), "Mario");
        assert!(DisplayName::parse(&"x".repeat(41)).is_err());
        assert!(DisplayName::parse("a\nb").is_err());
        let mut u = user(1, Role::Member);
        assert_eq!(u.shown_name(), "mario.rossi");
        u.display_name = DisplayName::parse("Mario").unwrap();
        assert_eq!(u.shown_name(), "Mario");
    }

    #[test]
    fn ruoli_e_colori() {
        assert_eq!(Role::parse("admin").unwrap(), Role::Admin);
        assert!(Role::parse("boh").is_err());
        assert_eq!(Role::Member.home(), "/");
        assert_eq!(AvatarColor::parse("lime").unwrap(), AvatarColor::Lime);
        assert!(AvatarColor::parse("viola").is_err());
        // tutti usati una volta tranne sky: tocca a sky
        let used: Vec<AvatarColor> = AvatarColor::ALL.into_iter().filter(|c| *c != AvatarColor::Sky).collect();
        assert_eq!(AvatarColor::least_used(&used), AvatarColor::Sky);
        assert_eq!(AvatarColor::least_used(&[]), AvatarColor::Violet);
        assert_eq!(AvatarColor::least_used(&[AvatarColor::Violet]), AvatarColor::Rose);
    }

    #[test]
    fn password() {
        let u = Username::parse("mariorossi").unwrap();
        assert!(check_new_password(&u, "vecchia123", "corta").is_err());
        assert!(check_new_password(&u, "vecchia123", "MarioRossi").is_err());
        assert!(check_new_password(&u, "vecchia123", "vecchia123").is_err());
        assert!(check_new_password(&u, "vecchia123", "nuovissima").is_ok());
        assert!(check_temporary_password("ab").is_ok());
        assert!(check_temporary_password("").is_err() && check_temporary_password("a\nb").is_err());
    }

    #[test]
    fn rimozione() {
        let admin = user(1, Role::Admin);
        assert!(check_can_remove(UserId(1), &admin, 2).is_err(), "sé stesso");
        assert!(check_can_remove(UserId(2), &admin, 1).is_err(), "ultimo amministratore");
        assert!(check_can_remove(UserId(2), &admin, 2).is_ok());
        assert!(check_can_remove(UserId(1), &user(3, Role::Member), 1).is_ok());
    }
}
