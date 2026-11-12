//! Aggiornamento dal vivo: quando i dati cambiano, le pagine aperte lo sanno subito (Server-Sent Events).
//!
//! Due tipi di avviso: «changed» a tutte le pagine (rileggono), e avvisi con dati solo alle pagine di certe persone
//! ([`Notifier::send`]: es. in SNotes «note», una nota è cambiata e la pagina la risincronizza, e «presence», dove sono
//! i cursori di chi la sta scrivendo). La pagina li riceve con `useLive(reload, { nome: (dati) => … })`.

use std::{
    convert::Infallible,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};

use axum::{
    extract::{Request, State},
    http::Method,
    middleware::Next,
    response::{
        Response,
        sse::{Event, KeepAlive, Sse},
    },
};
use futures_core::Stream;
use tokio::sync::broadcast::{self, error::RecvError};

use sapp_domain::user::UserId;

use crate::{Shared, auth::Me};

/// Avviso con dati per le pagine di alcune persone.
#[derive(Clone)]
struct Targeted {
    users: Arc<Vec<UserId>>,
    kind: &'static str,
    data: Arc<String>,
}

/// Avvisi "i dati sono cambiati", numerati, e avvisi con dati per alcune persone.
pub struct Notifier {
    tx: broadcast::Sender<u64>,
    seq: AtomicU64,
    to: broadcast::Sender<Targeted>,
}

impl Default for Notifier {
    fn default() -> Self {
        Notifier { tx: broadcast::channel(256).0, seq: AtomicU64::new(1), to: broadcast::channel(1024).0 }
    }
}

impl Notifier {
    pub fn changed(&self) {
        let n = self.seq.fetch_add(1, Ordering::Relaxed) + 1;
        let _ = self.tx.send(n);
    }
    fn current(&self) -> u64 {
        self.seq.load(Ordering::Relaxed)
    }
    /// Avviso `kind` con `data` (JSON) alle pagine aperte di `users`.
    pub fn send(&self, users: &[UserId], kind: &'static str, data: String) {
        if users.is_empty() {
            return;
        }
        let _ = self.to.send(Targeted { users: Arc::new(users.to_vec()), kind, data: Arc::new(data) });
    }
}

/// Flusso per una pagina: versione del server, numero attuale, poi un avviso a ogni cambiamento (e un battito ogni
/// 25 s, così i proxy non chiudono il collegamento).
pub async fn stream(State(st): State<Shared>, Me(me): Me) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = st.live.tx.subscribe();
    let mut to = st.live.to.subscribe();
    let version = st.app.version();
    let stream = async_stream::stream! {
        // dopo un aggiornamento la pagina vede la versione cambiata al riallaccio e si ricarica da sola
        yield Ok(Event::default().event("version").data(version));
        yield Ok(Event::default().event("hello").data(st.live.current().to_string()));
        loop {
            tokio::select! {
                r = rx.recv() => match r {
                    Ok(n) => yield Ok(Event::default().event("changed").data(n.to_string())),
                    Err(RecvError::Lagged(_)) => yield Ok(Event::default().event("changed").data("0")),
                    Err(RecvError::Closed) => break,
                },
                r = to.recv() => match r {
                    Ok(t) if t.users.contains(&me.id) => yield Ok(Event::default().event(t.kind).data(t.data.as_str())),
                    Ok(_) => {}
                    // persi degli avvisi: la pagina rilegge tutto
                    Err(RecvError::Lagged(_)) => yield Ok(Event::default().event("changed").data("0")),
                    Err(RecvError::Closed) => break,
                },
                _ = tokio::time::sleep(Duration::from_secs(25)) => yield Ok(Event::default().comment("ping")),
            }
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// Dopo una modifica riuscita avvisa tutte le pagine aperte.
/// (L'accesso e l'uscita dell'app non cambiano i dati di nessuno: niente avviso. Le rotte che avvisano da sole con
/// [`Notifier::send`] solo chi serve, es. a ogni lettera scritta, vanno aggiunte qui: in SNotes la sincronizzazione
/// delle note e i cursori.)
pub async fn notify_on_change(State(st): State<Shared>, req: Request, next: Next) -> Response {
    let path = req.uri().path();
    let quiet = path.starts_with("/api/device/");
    let mutating = req.method() != Method::GET && req.method() != Method::HEAD && !quiet;
    let res = next.run(req).await;
    if mutating && res.status().is_success() {
        st.live.changed();
    }
    res
}
