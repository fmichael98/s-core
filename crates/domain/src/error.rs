//! Errori con il messaggio da mostrare all'utente e il tipo (che decide come arriva alla pagina).

use std::fmt;

/// Che tipo di errore è.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErrorKind {
    /// dati non validi
    Invalid,
    /// non permesso
    Forbidden,
    /// non trovato
    NotFound,
    /// stato che non lo consente (es. operazione già in corso)
    Conflict,
    /// funzione non disponibile su questo server
    Unavailable,
    /// guasto interno
    Internal,
}

/// Errore con il messaggio da mostrare all'utente.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Error {
    pub kind: ErrorKind,
    pub msg: String,
}

impl Error {
    pub fn new(kind: ErrorKind, msg: impl Into<String>) -> Self {
        Error { kind, msg: msg.into() }
    }
    pub fn invalid(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Invalid, msg)
    }
    pub fn forbidden(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Forbidden, msg)
    }
    pub fn not_found(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::NotFound, msg)
    }
    pub fn conflict(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Conflict, msg)
    }
    pub fn unavailable(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Unavailable, msg)
    }
    pub fn internal(msg: impl Into<String>) -> Self {
        Self::new(ErrorKind::Internal, msg)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.msg)
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;
