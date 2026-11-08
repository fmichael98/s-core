//! L'app Android installata col pacchetto: install.sh la mette in /var/lib/sapp/app (un file .apk, il nome
//! dice la versione: «SApp 2.0.apk»).

use std::path::PathBuf;

use sapp_app::ports::{ApkInfo, AppPackage};
use sapp_domain::{Error, Result};

pub struct ApkFolder {
    dir: PathBuf,
}

impl ApkFolder {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        ApkFolder { dir: dir.into() }
    }

    /// Da `SAPP_APP_DIR`, altrimenti /var/lib/sapp/app.
    pub fn from_env() -> Self {
        Self::new(std::env::var("SAPP_APP_DIR").unwrap_or_else(|_| "/var/lib/sapp/app".into()))
    }

    /// Il primo .apk della cartella.
    fn file(&self) -> Option<PathBuf> {
        let mut list: Vec<PathBuf> =
            std::fs::read_dir(&self.dir).ok()?.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "apk")).collect();
        list.sort();
        list.pop()
    }
}

/// «SApp 2.0.apk» → "2.0".
fn version_of(name: &str) -> String {
    name.trim_end_matches(".apk").rsplit([' ', '-', '_']).next().unwrap_or("").to_string()
}

impl AppPackage for ApkFolder {
    fn info(&self) -> Option<ApkInfo> {
        let p = self.file()?;
        let size = std::fs::metadata(&p).ok()?.len();
        let name = p.file_name()?.to_string_lossy().to_string();
        let version = version_of(&name);
        Some(ApkInfo { file_name: format!("SApp-{version}.apk"), version, size })
    }

    fn read(&self) -> Result<Vec<u8>> {
        let p = self.file().ok_or_else(|| Error::not_found("L'app Android non c'è su questo server: arriva col prossimo aggiornamento."))?;
        std::fs::read(&p).map_err(|e| Error::internal(format!("lettura dell'app: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cartella() {
        assert_eq!(version_of("SApp 2.0.apk"), "2.0");
        assert_eq!(version_of("SApp-2.1.apk"), "2.1");
        let dir = std::env::temp_dir().join(format!("sapp-apk-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let f = ApkFolder::new(&dir);
        assert!(f.info().is_none() && f.read().is_err());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SApp 2.0.apk"), b"PK").unwrap();
        let i = f.info().unwrap();
        assert_eq!((i.version.as_str(), i.size, i.file_name.as_str()), ("2.0", 2, "SApp-2.0.apk"));
        assert_eq!(f.read().unwrap(), b"PK");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
