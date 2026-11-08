//! Testi scritti dagli utenti: senza spazi ai lati, lunghezza controllata, niente caratteri di controllo.

use crate::{Error, Result};

/// Testo su una riga: da `min` a `max` caratteri (dopo aver tolto gli spazi ai lati).
pub fn line(label: &str, s: &str, min: usize, max: usize) -> Result<String> {
    let t = s.trim();
    if t.chars().any(char::is_control) {
        return Err(Error::invalid(format!("{label}: caratteri non ammessi.")));
    }
    check_len(label, t, min, max)
}

/// Testo su più righe (note): a capo ammessi, righe vuote in fondo tolte.
pub fn multiline(label: &str, s: &str, max: usize) -> Result<String> {
    let t = s.trim().replace("\r\n", "\n");
    if t.chars().any(|c| c.is_control() && c != '\n' && c != '\t') {
        return Err(Error::invalid(format!("{label}: caratteri non ammessi.")));
    }
    check_len(label, &t, 0, max)
}

fn check_len(label: &str, t: &str, min: usize, max: usize) -> Result<String> {
    let n = t.chars().count();
    if n < min {
        return Err(Error::invalid(if min == 1 { format!("{label}: obbligatorio.") } else { format!("{label}: almeno {min} caratteri.") }));
    }
    if n > max {
        return Err(Error::invalid(format!("{label}: al massimo {max} caratteri.")));
    }
    Ok(t.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn righe() {
        assert_eq!(line("Marca", "  Fiat ", 1, 40).unwrap(), "Fiat");
        assert!(line("Marca", "   ", 1, 40).unwrap_err().msg.contains("obbligatorio"));
        assert!(line("Marca", &"x".repeat(41), 1, 40).is_err());
        assert!(line("Marca", "a\nb", 1, 40).is_err());
        assert_eq!(multiline("Note", " uno\r\ndue \n", 100).unwrap(), "uno\ndue");
        assert!(multiline("Note", "a\u{7}", 100).is_err());
    }
}
