//! Prove dei casi d'uso con gli adattatori veri (SQLite in memoria) e, al posto dell'orologio, di uno finto
//! che si comanda dalla prova.

use std::{
    net::IpAddr,
    sync::{Arc, Mutex},
};

use sapp_app::{
    App, Ports,
    accounts::Login,
    config::ServerConfig,
    ports::{Clock, Security},
};
use sapp_domain::{
    Date, DateTime, ErrorKind,
    time::Timestamp,
    user::{Role, User},
};
use sapp_sqlite::SqliteDb;
use sapp_system::{LinuxHost, apk::ApkFolder, config_file::TomlConfigFile, security::Argon2Security, update::UpdateArea};

fn day(m: u32, d: u32) -> Date {
    Date::from_ymd_opt(2026, m, d).unwrap()
}
fn at(m: u32, d: u32, h: u32, min: u32) -> DateTime {
    day(m, d).and_hms_opt(h, min, 0).unwrap()
}

/// Orologio fermo, spostato dalla prova (ora locale = UTC).
struct FakeClock(Mutex<DateTime>);
impl Clock for FakeClock {
    fn now(&self) -> Timestamp {
        Timestamp(self.0.lock().unwrap().and_utc().timestamp())
    }
    fn local_now(&self) -> DateTime {
        *self.0.lock().unwrap()
    }
    fn instant_of(&self, local: DateTime) -> Timestamp {
        Timestamp(local.and_utc().timestamp())
    }
}

struct World {
    app: App,
    clock: Arc<FakeClock>,
}

fn world() -> World {
    let tmp = std::env::temp_dir().join(format!("sapp-app-{}-{:?}", std::process::id(), std::thread::current().id()));
    let clock = Arc::new(FakeClock(Mutex::new(at(11, 8, 21, 0))));
    let cfg = ServerConfig { password_hash: Argon2Security.hash_password("segreta123"), ..ServerConfig::default() };
    let ports = Ports {
        db: Arc::new(SqliteDb::in_memory().unwrap()),
        security: Arc::new(Argon2Security),
        clock: clock.clone(),
        host: Arc::new(LinuxHost),
        config_file: Arc::new(TomlConfigFile::new(tmp.join("config.toml").to_string_lossy())),
        updater: Arc::new(UpdateArea::new(tmp.join("update"), "1.0.0")),
        apk: Arc::new(ApkFolder::new(tmp.join("app"))),
    };
    let app = App::new(ports, cfg, "1.0.0");
    app.bootstrap_admin(&[]).unwrap();
    World { app, clock }
}

fn ip() -> IpAddr {
    "10.0.0.9".parse().unwrap()
}

/// Utente nuovo (deve ancora cambiare la password).
fn member(w: &World, name: &str) -> User {
    let (id, _) = w.app.create_user(name, "", Role::Member).unwrap();
    w.app.list_users().unwrap().into_iter().find(|s| s.user.id == id).unwrap().user
}

#[test]
fn accesso_dal_browser_e_dal_telefono() {
    let w = world();
    let u = member(&w, "michael");
    w.app.reset_password(u.id, "provvisoria").unwrap();
    let Login::Ok { token, home, .. } = w.app.login("michael", "provvisoria", ip(), "browser", None).unwrap() else { panic!() };
    assert_eq!(home, "/password");
    let me = w.app.session_user(&token, "browser").unwrap().unwrap();
    w.app.change_password(&me, "provvisoria", "nuovissima1", &token).unwrap();
    let Login::Ok { token: phone, ttl, .. } = w.app.login("michael", "nuovissima1", ip(), "SApp-Android/2.0", Some("Pixel")).unwrap() else { panic!() };
    assert_eq!(ttl.as_secs(), 365 * 86_400, "il telefono resta collegato a lungo");
    let devices = w.app.devices(&me).unwrap();
    assert_eq!((devices.len(), devices[0].name.as_str()), (1, "Pixel"));
    // l'amministratore non entra dall'app
    assert_eq!(w.app.login("admin", "segreta123", ip(), "a", Some("x")).unwrap_err().kind, ErrorKind::Forbidden);
    w.app.remove_device(&me, devices[0].id).unwrap();
    assert!(w.app.session_user(&phone, "a").unwrap().is_none());
    assert!(w.app.session_user(&token, "browser").unwrap().is_some());
}

#[test]
fn primo_avvio_con_gli_amministratori_di_prima() {
    let w = world();
    // ce n'è già uno: non si rifà
    assert!(w.app.bootstrap_admin(&[("vecchio".into(), "$argon2id$x".into())]).unwrap().is_empty());
}

#[test]
fn troppi_tentativi_e_sessioni_scadute() {
    let w = world();
    let u = member(&w, "anna");
    // la prima password è il nome utente
    let Login::Ok { token, .. } = w.app.login("anna", "anna", ip(), "browser", None).unwrap() else { panic!() };
    let me = w.app.session_user(&token, "browser").unwrap().unwrap();
    assert_eq!(me.id, u.id);
    let mut locked = false;
    for _ in 0..10 {
        match w.app.login("anna", "sbagliata", ip(), "browser", None).unwrap() {
            Login::Locked { .. } => locked = true,
            Login::Wrong { locked: true, .. } => locked = true,
            _ => {}
        }
    }
    assert!(locked, "dopo troppi errori l'indirizzo si blocca");
    // anche la password giusta aspetta lo sblocco
    assert!(matches!(w.app.login("anna", "anna", ip(), "browser", None).unwrap(), Login::Locked { .. }));
    // passato più di un mese (session_days = 30) la sessione del browser è scaduta
    *w.clock.0.lock().unwrap() = at(12, 20, 9, 0);
    w.app.purge_sessions().unwrap();
    assert!(w.app.session_user(&token, "browser").unwrap().is_none());
}

#[test]
fn utenti_e_amministratori() {
    let w = world();
    let anna = member(&w, "anna");
    assert_eq!(w.app.create_user("anna", "", Role::Member).unwrap_err().kind, ErrorKind::Conflict);
    w.app.edit_user(anna.id, "Anna", "rose").unwrap();
    let admin = w.app.list_users().unwrap().into_iter().find(|s| s.user.role == Role::Admin).unwrap().user;
    // l'ultimo amministratore non si toglie
    assert!(w.app.delete_user(admin.id, admin.id).is_err());
    w.app.set_disabled(admin.id, anna.id, true).unwrap();
    assert!(matches!(w.app.login("anna", "anna", ip(), "browser", None).unwrap(), Login::Wrong { .. }));
    w.app.delete_user(admin.id, anna.id).unwrap();
    assert_eq!(w.app.list_users().unwrap().len(), 1);
}
