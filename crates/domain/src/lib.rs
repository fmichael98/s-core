//! Dominio dell'app: le regole, senza database, rete, file o formati di scambio.
//!
//! Tutto qui è puro (dati in ingresso → risultato) e si prova con i test di ogni modulo.
//! I tipi sono costruiti in modo che i valori sbagliati non si possano nemmeno creare: un [`user::Username`] esiste
//! solo se è valido, una [`user::Password`] solo se rispetta le regole, e così via.
//!
//! Qui va il dominio proprio dell'app (veicoli, turni, eventi…): un modulo per concetto, con i suoi test.

pub use chrono::{NaiveDate as Date, NaiveDateTime as DateTime, NaiveTime as Time};

#[macro_use]
mod keyed;

pub mod day;
pub mod error;
pub mod text;
pub mod time;
pub mod user;

pub use error::{Error, ErrorKind, Result};
