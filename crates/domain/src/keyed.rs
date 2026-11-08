//! Elenchi di valori con la chiave (per dati e pagine) e il nome da mostrare.

/// `keyed! { /// doc\n Nome, "Cosa" { Variante = "chiave", "Nome"; … } }`: enum con `ALL`, `as_str`, `label`, `parse`.
/// Per gli elenchi chiusi dell'app (tipi di turno, alimentazione…): la chiave va nei dati, il nome sulle pagine.
#[allow(unused_macros)]
macro_rules! keyed {
    ($(#[$m:meta])* $name:ident, $what:literal { $($(#[$vm:meta])* $v:ident = $key:literal, $label:literal;)* }) => {
        $(#[$m])*
        #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub enum $name { $($(#[$vm])* $v),* }

        impl $name {
            pub const ALL: &'static [$name] = &[$($name::$v),*];
            pub const fn as_str(self) -> &'static str {
                match self { $($name::$v => $key),* }
            }
            pub const fn label(self) -> &'static str {
                match self { $($name::$v => $label),* }
            }
            pub fn parse(s: &str) -> $crate::Result<$name> {
                Self::ALL.iter().copied().find(|x| x.as_str() == s).ok_or_else(|| $crate::Error::invalid(format!("{} non valido: {s}", $what)))
            }
        }
    };
}
