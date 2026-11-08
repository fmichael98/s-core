//! Giorni e orari scritti dagli utenti ("AAAA-MM-GG", "HH:MM") e i conti sulle date.

use chrono::{Datelike, Months, NaiveDate, NaiveDateTime, NaiveTime, TimeDelta, Weekday};

use crate::{Error, Result};

/// Primo e ultimo anno accettati (oltre non ha senso un calendario di casa).
pub const FIRST_YEAR: i32 = 1900;
pub const LAST_YEAR: i32 = 2200;

/// Giorno "AAAA-MM-GG".
pub fn parse_date(label: &str, s: &str) -> Result<NaiveDate> {
    let d = NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").map_err(|_| Error::invalid(format!("{label}: data non valida.")))?;
    if !(FIRST_YEAR..=LAST_YEAR).contains(&d.year()) {
        return Err(Error::invalid(format!("{label}: anno fuori dal calendario.")));
    }
    Ok(d)
}

/// Orario "HH:MM" (24 ore).
pub fn parse_time(label: &str, s: &str) -> Result<NaiveTime> {
    let s = s.trim();
    if s.len() != 5 {
        return Err(Error::invalid(format!("{label}: orario non valido (HH:MM).")));
    }
    NaiveTime::parse_from_str(s, "%H:%M").map_err(|_| Error::invalid(format!("{label}: orario non valido (HH:MM).")))
}

/// Orario facoltativo (vuoto: `None`).
pub fn parse_time_opt(label: &str, s: &str) -> Result<Option<NaiveTime>> {
    if s.trim().is_empty() { Ok(None) } else { parse_time(label, s).map(Some) }
}

/// "AAAA-MM-GG"
pub fn iso(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

/// "HH:MM"
pub fn hm(t: NaiveTime) -> String {
    t.format("%H:%M").to_string()
}

/// "AAAA-MM-GGTHH:MM"
pub fn iso_dt(t: NaiveDateTime) -> String {
    t.format("%Y-%m-%dT%H:%M").to_string()
}

/// `d` più `n` giorni (anche negativi).
pub fn add_days(d: NaiveDate, n: i64) -> NaiveDate {
    d.checked_add_signed(TimeDelta::days(n)).unwrap_or(if n < 0 { NaiveDate::MIN } else { NaiveDate::MAX })
}

/// `d` più `n` mesi; `None` se il giorno non esiste in quel mese (il 31 di aprile).
pub fn add_months_exact(d: NaiveDate, n: u32) -> Option<NaiveDate> {
    let total = d.year() * 12 + d.month0() as i32 + n as i32;
    NaiveDate::from_ymd_opt(total.div_euclid(12), total.rem_euclid(12) as u32 + 1, d.day())
}

/// `d` più `n` mesi (il 31 gennaio più un mese è l'ultimo di febbraio).
pub fn add_months(d: NaiveDate, n: u32) -> NaiveDate {
    d.checked_add_months(Months::new(n)).unwrap_or(NaiveDate::MAX)
}

/// Giorni da `a` a `b` (negativo se `b` viene prima).
pub fn days_between(a: NaiveDate, b: NaiveDate) -> i64 {
    (b - a).num_days()
}

/// Lunedì della settimana di `d`.
pub fn monday_of(d: NaiveDate) -> NaiveDate {
    add_days(d, -i64::from(d.weekday().num_days_from_monday()))
}

/// Giorno della settimana da 0 (lunedì) a 6 (domenica).
pub fn weekday_index(w: Weekday) -> u32 {
    w.num_days_from_monday()
}

/// Giorno della settimana da 0 (lunedì) a 6 (domenica).
pub fn weekday_from_index(i: u32) -> Option<Weekday> {
    (i < 7).then(|| Weekday::Mon.succ_by(i))
}

trait SuccBy {
    fn succ_by(self, n: u32) -> Self;
}
impl SuccBy for Weekday {
    fn succ_by(self, n: u32) -> Weekday {
        (0..n).fold(self, |w, _| w.succ())
    }
}

/// Primo giorno del mese e numero di giorni.
pub fn month_len(year: i32, month: u32) -> u32 {
    let first = NaiveDate::from_ymd_opt(year, month, 1);
    let next = if month == 12 { NaiveDate::from_ymd_opt(year + 1, 1, 1) } else { NaiveDate::from_ymd_opt(year, month + 1, 1) };
    match (first, next) {
        (Some(a), Some(b)) => (b - a).num_days() as u32,
        _ => 0,
    }
}

/// L'`n`-esimo `w` del mese (1..=5), o l'ultimo se `n` è -1; `None` se non c'è (il quinto lunedì).
pub fn nth_weekday(year: i32, month: u32, w: Weekday, n: i32) -> Option<NaiveDate> {
    if n == -1 {
        let last = NaiveDate::from_ymd_opt(year, month, month_len(year, month))?;
        let back = (7 + weekday_index(last.weekday()) - weekday_index(w)) % 7;
        return Some(add_days(last, -i64::from(back)));
    }
    if !(1..=5).contains(&n) {
        return None;
    }
    let first = NaiveDate::from_ymd_opt(year, month, 1)?;
    let ahead = (7 + weekday_index(w) - weekday_index(first.weekday())) % 7;
    let d = add_days(first, i64::from(ahead) + 7 * i64::from(n - 1));
    (d.month() == month).then_some(d)
}

/// Quale volta è `d` nel suo mese per quel giorno della settimana (1..=5) e se è l'ultima.
pub fn week_of_month(d: NaiveDate) -> (i32, bool) {
    let n = (d.day() as i32 - 1) / 7 + 1;
    let last = add_days(d, 7).month() != d.month();
    (n, last)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(y: i32, m: u32, d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(y, m, d).unwrap()
    }

    #[test]
    fn date_e_orari() {
        assert_eq!(parse_date("Data", " 2026-11-08 ").unwrap(), day(2026, 11, 8));
        assert!(parse_date("Data", "2026-02-30").is_err());
        assert!(parse_date("Data", "1800-01-01").is_err());
        assert_eq!(hm(parse_time("Ora", "07:05").unwrap()), "07:05");
        assert!(parse_time("Ora", "7:05").is_err());
        assert!(parse_time("Ora", "24:00").is_err());
        assert_eq!(parse_time_opt("Ora", " ").unwrap(), None);
        assert_eq!(iso(day(2026, 1, 2)), "2026-01-02");
    }

    #[test]
    fn conti() {
        assert_eq!(add_days(day(2026, 3, 1), -1), day(2026, 2, 28));
        assert_eq!(add_months_exact(day(2026, 1, 31), 1), None);
        assert_eq!(add_months_exact(day(2026, 1, 31), 2), Some(day(2026, 3, 31)));
        assert_eq!(add_months_exact(day(2026, 11, 15), 3), Some(day(2027, 2, 15)));
        assert_eq!(add_months(day(2025, 1, 31), 1), day(2025, 2, 28));
        assert_eq!(monday_of(day(2026, 11, 8)), day(2026, 11, 2));
        assert_eq!(month_len(2024, 2), 29);
        assert_eq!(month_len(2026, 12), 31);
        assert_eq!(weekday_from_index(2), Some(Weekday::Wed));
        assert_eq!(weekday_from_index(7), None);
    }

    #[test]
    fn giorni_della_settimana_nel_mese() {
        // novembre 2026: il primo è domenica
        assert_eq!(nth_weekday(2026, 11, Weekday::Mon, 1), Some(day(2026, 11, 2)));
        assert_eq!(nth_weekday(2026, 11, Weekday::Sun, 5), Some(day(2026, 11, 29)));
        assert_eq!(nth_weekday(2026, 11, Weekday::Mon, 5), Some(day(2026, 11, 30)));
        assert_eq!(nth_weekday(2026, 11, Weekday::Tue, 5), None);
        assert_eq!(nth_weekday(2026, 11, Weekday::Fri, -1), Some(day(2026, 11, 27)));
        assert_eq!(week_of_month(day(2026, 11, 27)), (4, true));
        assert_eq!(week_of_month(day(2026, 11, 20)), (3, false));
    }
}
