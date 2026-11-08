//! Aggiornamento dal vivo: quando i dati cambiano, le pagine aperte lo sanno subito (Server-Sent Events).

use std::{
    convert::Infallible,
    sync::atomic::{AtomicU64, Ordering},
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

use crate::{Shared, auth::Me};

/// Avvisi "i dati sono cambiati", numerati.
pub struct Notifier {
    tx: broadcast::Sender<u64>,
    seq: AtomicU64,
}

impl Default for Notifier {
    fn default() -> Self {
        Notifier { tx: broadcast::channel(256).0, seq: AtomicU64::new(1) }
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
}

/// Flusso per una pagina: versione del server, numero attuale, poi un avviso a ogni cambiamento (e un battito ogni
/// 25 s, così i proxy non chiudono il collegamento).
pub async fn stream(State(st): State<Shared>, _me: Me) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = st.live.tx.subscribe();
    let version = st.app.version();
    let stream = async_stream::stream! {
        // dopo un aggiornamento la pagina vede la versione cambiata al riallaccio e si ricarica da sola
        yield Ok(Event::default().event("version").data(version));
        yield Ok(Event::default().event("hello").data(st.live.current().to_string()));
        loop {
            match tokio::time::timeout(Duration::from_secs(25), rx.recv()).await {
                Ok(Ok(n)) => yield Ok(Event::default().event("changed").data(n.to_string())),
                Ok(Err(RecvError::Lagged(_))) => yield Ok(Event::default().event("changed").data("0")),
                Ok(Err(RecvError::Closed)) => break,
                Err(_) => yield Ok(Event::default().comment("ping")),
            }
        }
    };
    Sse::new(stream).keep_alive(KeepAlive::default())
}

/// Dopo una modifica riuscita avvisa tutte le pagine aperte.
/// (L'accesso e l'uscita dell'app non cambiano i dati di nessuno: niente avviso.)
pub async fn notify_on_change(State(st): State<Shared>, req: Request, next: Next) -> Response {
    let mutating = req.method() != Method::GET && req.method() != Method::HEAD && !req.uri().path().starts_with("/api/device/");
    let res = next.run(req).await;
    if mutating && res.status().is_success() {
        st.live.changed();
    }
    res
}
