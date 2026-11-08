//! Incorpora la chiave pubblica della firma dei pacchetti (packaging/firma.pub), se c'è: da quel momento il
//! programma installa solo zip firmati da GitHub Actions.

use std::{env, fs, path::Path};

fn main() {
    println!("cargo:rerun-if-changed=../../packaging/firma.pub");
    let key = Path::new("../../packaging/firma.pub");
    let code = match key.canonicalize() {
        Ok(p) => format!(
            "/// chiave pubblica della firma dei pacchetti (packaging/firma.pub)\npub const FIRMA: Option<&str> = Some(include_str!({:?}));\n",
            p.to_string_lossy()
        ),
        Err(_) => "/// nessuna chiave (packaging/firma.pub assente): i pacchetti non si controllano\npub const FIRMA: Option<&str> = None;\n".to_string(),
    };
    let out = env::var("OUT_DIR").expect("OUT_DIR");
    fs::write(Path::new(&out).join("firma.rs"), code).expect("firma.rs");
}
