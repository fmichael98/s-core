//! Novità per versione, da CHANGELOG.md (incorporato nel programma).
//!
//! Formato: `## X.Y.Z` e sotto le voci `- …`.

use serde::Serialize;

const TEXT: &str = include_str!("../../../CHANGELOG.md");

#[derive(Serialize, Debug, PartialEq, Eq)]
pub struct Release {
    pub version: String,
    pub items: Vec<String>,
}

fn parse(text: &str) -> Vec<Release> {
    let mut out: Vec<Release> = vec![];
    for line in text.lines() {
        if let Some(v) = line.strip_prefix("## ") {
            out.push(Release { version: v.trim().to_string(), items: vec![] });
        } else if let (Some(item), Some(last)) = (line.strip_prefix("- "), out.last_mut()) {
            last.items.push(item.trim().to_string());
        }
    }
    out
}

fn newer(a: &str, b: &str) -> bool {
    let n = |v: &str| v.split('.').map(|x| x.parse::<u64>().ok()).collect::<Option<Vec<u64>>>();
    matches!((n(a), n(b)), (Some(x), Some(y)) if x > y)
}

/// Tutte le versioni (dalla più nuova), o solo quelle dopo `after`.
pub fn releases(after: Option<&str>) -> Vec<Release> {
    parse(TEXT).into_iter().filter(|r| after.is_none_or(|a| newer(&r.version, a))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lettura() {
        let r = parse("# titolo\n\n## 0.2.0\n- due\n- tre\n\n## 0.1.0\n- uno\n");
        assert_eq!(r.len(), 2);
        assert_eq!(r[0], Release { version: "0.2.0".into(), items: vec!["due".into(), "tre".into()] });
        assert!(!releases(None).is_empty(), "il CHANGELOG del progetto si legge");
        assert!(releases(Some("999.0.0")).is_empty());
    }
}
