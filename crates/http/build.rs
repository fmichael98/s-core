//! Il server incorpora la pagina web compilata (frontend/dist, prodotta da Vite): qui ne preparo l'elenco dei file.
//! Se manca, lo dico chiaramente.

use std::{
    env, fs,
    path::{Path, PathBuf},
};

const DIST: &str = "../../frontend/dist";
const PAGES: [&str; 4] = ["index.html", "admin.html", "login.html", "password.html"];

fn files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            files(&p, out);
        } else {
            out.push(p);
        }
    }
}

fn mime(name: &str) -> &'static str {
    match name.rsplit('.').next().unwrap_or("") {
        "js" | "mjs" => "application/javascript; charset=utf-8",
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/manifest+json",
        "png" => "image/png",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "webp" => "image/webp",
        "wasm" => "application/wasm",
        _ => "application/octet-stream",
    }
}

fn main() {
    println!("cargo:rerun-if-changed={DIST}");
    println!("cargo:rerun-if-changed=../../CHANGELOG.md");
    let dist = Path::new(DIST);
    let missing: Vec<&str> = PAGES.iter().copied().filter(|f| !dist.join(f).exists()).collect();
    if !missing.is_empty() {
        panic!("\n\nManca la pagina web compilata ({}).\nPrima compila il frontend:\n    cd frontend\n    npm ci\n    npm run build\n\n", missing.join(", "));
    }
    let dist = dist.canonicalize().expect("frontend/dist");
    let mut all = Vec::new();
    files(&dist, &mut all);
    all.sort();

    let mut code = String::from("// generato da build.rs: file di frontend/dist\n\n");
    code.push_str("const ASSETS: &[Asset] = &[\n");
    for p in &all {
        let rel = p.strip_prefix(&dist).expect("dentro dist").to_string_lossy().replace('\\', "/");
        if PAGES.contains(&rel.as_str()) {
            continue;
        }
        // in assets/ i nomi hanno l'impronta del contenuto: si possono tenere per sempre
        let cache = if rel.starts_with("assets/") {
            "IMMUTABLE"
        } else if rel.starts_with("favicon") || rel.starts_with("icon") {
            "DAY"
        } else {
            "FRESH"
        };
        code.push_str(&format!("    Asset {{ path: \"/{rel}\", mime: {:?}, cache: {cache}, body: include_bytes!({:?}) }},\n", mime(&rel), p.to_string_lossy()));
    }
    code.push_str("];\n\n");
    for page in PAGES {
        let name = page.trim_end_matches(".html").to_uppercase();
        code.push_str(&format!("const {name}: &str = include_str!({:?});\n", dist.join(page).to_string_lossy()));
    }
    let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    fs::write(out.join("assets.rs"), code).expect("assets.rs");
}
