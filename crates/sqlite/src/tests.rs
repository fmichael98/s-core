//! Prove dell'adattatore: schema, vincoli e query che il dominio non vede.

use sapp_app::ports::{Database, NewUser, SessionKey, tx};
use sapp_domain::{
    ErrorKind,
    time::Timestamp,
    user::{AvatarColor, DisplayName, Role, UserId, Username},
};

use crate::SqliteDb;

fn new_user(name: &str) -> NewUser {
    NewUser {
        username: Username::parse(name).unwrap(),
        display_name: DisplayName::default(),
        color: AvatarColor::Blue,
        role: Role::Member,
        pass_hash: "x".into(),
        must_change: false,
        created: Timestamp(0),
    }
}

fn user(r: &dyn sapp_app::ports::Repos, name: &str) -> UserId {
    r.insert_user(&new_user(name)).unwrap()
}

#[test]
fn utenti_e_nomi_doppi() {
    let db = SqliteDb::in_memory().unwrap();
    tx(&db, |r| {
        let a = user(r, "anna");
        user(r, "bruno");
        assert_eq!(r.insert_user(&new_user("anna")).unwrap_err().kind, ErrorKind::Conflict);
        r.set_profile(a, &DisplayName::parse("Anna").unwrap(), AvatarColor::Rose)?;
        let u = r.user(a)?.unwrap();
        assert_eq!((u.display_name.as_str(), u.color), ("Anna", AvatarColor::Rose));
        assert_eq!(r.users()?.iter().map(|u| u.username.as_str().to_string()).collect::<Vec<_>>(), ["anna", "bruno"]);
        Ok(())
    })
    .unwrap();
}

#[test]
fn sessioni_telefoni_e_scadenze() {
    let db = SqliteDb::in_memory().unwrap();
    tx(&db, |r| {
        let a = user(r, "anna");
        let k = |s: &str| SessionKey(s.into());
        r.insert_session(&k("browser"), a, Timestamp(10), Timestamp(100), "Firefox", None)?;
        r.insert_session(&k("telefono"), a, Timestamp(10), Timestamp(1000), "SAppApp/1.0", Some("Pixel 8"))?;
        assert_eq!(r.sessions_per_user(Timestamp(50))?, vec![(a, 2)]);
        let devices = r.devices_of(a, Timestamp(50))?;
        assert_eq!(devices.iter().map(|d| d.name.as_str()).collect::<Vec<_>>(), ["Pixel 8"]);
        // scaduta quella del browser: la pulizia la toglie, il telefono resta
        assert_eq!(r.delete_expired_sessions(Timestamp(200))?, 1);
        assert!(r.session(&k("browser"))?.is_none());
        assert_eq!(r.session(&k("telefono"))?.unwrap().device.as_deref(), Some("Pixel 8"));
        assert!(r.delete_device(a, devices[0].id)?);
        assert!(r.session(&k("telefono"))?.is_none());
        Ok(())
    })
    .unwrap();
}

#[test]
fn impostazioni_e_copia_senza_sessioni() {
    let db = SqliteDb::in_memory().unwrap();
    tx(&db, |r| {
        let a = user(r, "anna");
        r.set_setting("chiave", Some("valore"))?;
        assert_eq!(r.setting("chiave")?.as_deref(), Some("valore"));
        r.set_setting("chiave", None)?;
        assert_eq!(r.setting("chiave")?, None);
        r.insert_session(&SessionKey("segreta".into()), a, Timestamp(1), Timestamp(100), "", None)
    })
    .unwrap();
    let path = std::env::temp_dir().join(format!("sapp-copia-{}.db", std::process::id()));
    db.backup_to(&path).unwrap();
    let copy = rusqlite::Connection::open(&path).unwrap();
    let sessions: i64 = copy.query_row("SELECT COUNT(*) FROM sessions", [], |r| r.get(0)).unwrap();
    let users: i64 = copy.query_row("SELECT COUNT(*) FROM users", [], |r| r.get(0)).unwrap();
    assert_eq!((sessions, users), (0, 1));
    let _ = std::fs::remove_file(&path);
}

#[test]
fn un_database_di_altri_non_si_apre() {
    let path = std::env::temp_dir().join(format!("sapp-altro-{}.db", std::process::id()));
    let _ = std::fs::remove_file(&path);
    {
        let c = rusqlite::Connection::open(&path).unwrap();
        c.execute_batch("CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT); PRAGMA user_version = 1;").unwrap();
    }
    let err = SqliteDb::open(&path).err().unwrap();
    assert!(err.msg.contains("non è di SApp"), "{}", err.msg);
    let _ = std::fs::remove_file(&path);
    // un file nuovo invece sì, col segno dell'app
    drop(SqliteDb::open(&path).unwrap());
    let c = rusqlite::Connection::open(&path).unwrap();
    let id: i64 = c.query_row("PRAGMA application_id", [], |r| r.get(0)).unwrap();
    assert_eq!(id, crate::schema::APPLICATION_ID);
    let _ = std::fs::remove_file(&path);
}
