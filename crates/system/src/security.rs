//! Password e gettoni.

use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::{Rng, RngCore};
use sapp_app::ports::{Security, SessionKey};
use sha2::{Digest, Sha256};

pub struct Argon2Security;

impl Argon2Security {
    /// L'impronta è nel formato giusto (es. il password_hash del primo amministratore nel config).
    pub fn is_hash(s: &str) -> bool {
        PasswordHash::new(s).is_ok()
    }
}

impl Security for Argon2Security {
    fn hash_password(&self, password: &str) -> String {
        let salt = SaltString::generate(&mut OsRng);
        // con i parametri standard non può fallire
        Argon2::default().hash_password(password.as_bytes(), &salt).map(|h| h.to_string()).unwrap_or_default()
    }

    fn verify_password(&self, password: &str, hash: &str) -> bool {
        PasswordHash::new(hash).is_ok_and(|h| Argon2::default().verify_password(password.as_bytes(), &h).is_ok())
    }

    /// 32 byte casuali (256 bit).
    fn new_session_token(&self) -> String {
        let mut b = [0u8; 32];
        OsRng.fill_bytes(&mut b);
        URL_SAFE_NO_PAD.encode(b)
    }

    /// SHA-256 del gettone, in esadecimale.
    fn session_key(&self, token: &str) -> SessionKey {
        SessionKey(Sha256::digest(token.as_bytes()).iter().map(|b| format!("{b:02x}")).collect())
    }

    /// Tre gruppi di 4 caratteri facili da dettare, senza quelli che si confondono (0/o, 1/l/i): circa 59 bit,
    /// con il blocco dei tentativi non si indovina.
    fn temp_password(&self) -> String {
        const CHARS: &[u8] = b"abcdefghjkmnpqrstuvwxyz23456789";
        let mut rng = rand::thread_rng();
        (0..3).map(|_| (0..4).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect::<String>()).collect::<Vec<_>>().join("-")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_e_gettoni() {
        let s = Argon2Security;
        let h = s.hash_password("segreta123");
        assert!(Argon2Security::is_hash(&h) && !Argon2Security::is_hash("niente"));
        assert!(s.verify_password("segreta123", &h));
        assert!(!s.verify_password("sbagliata", &h));
        assert!(!s.verify_password("segreta123", "non è un'impronta"));
        let (a, b) = (s.new_session_token(), s.new_session_token());
        assert_ne!(a, b);
        assert_eq!(a.len(), 43);
        assert_eq!(s.session_key(&a), s.session_key(&a));
        assert_eq!(s.session_key(&a).0.len(), 64);
        let t = s.temp_password();
        assert_eq!(t.len(), 14);
        assert!(t.chars().all(|c| c == '-' || CHARS_OK.contains(c)));
    }

    const CHARS_OK: &str = "abcdefghjkmnpqrstuvwxyz23456789";
}
