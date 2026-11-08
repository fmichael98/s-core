/* Dati scambiati con il server (le stesse forme delle risposte JSON). */

/** amministratore (utenti, configurazione, aggiornamenti; non usa l'app) o utente */
export type Role = "admin" | "member"

/** Utente come lo manda il server. */
export interface User {
  id: number
  username: string
  /** nome scelto (può essere vuoto) */
  display_name: string
  /** nome da mostrare: quello scelto o il nome utente */
  name: string
  /** chiave della tavolozza (rose, sky…) */
  color: string
  role: Role
  must_change: boolean
  disabled: boolean
  created: number
  last_login: number | null
}

/** /api/me: chi è collegato */
export interface Me extends User {
  version: string
}

/** /api/admin/users */
export interface UserRow extends User {
  /** sessioni aperte (browser e telefoni) */
  sessions: number
  /** dati suoi (veicoli, calendari…: li conta l'app) */
  items: number
}

/** Un'altra persona (proprietario o con cui condividere). */
export interface Person {
  id: number
  username: string
  name: string
  color: string
}

// qui i tipi dei dati dell'app (come li manda il server)

export interface ApkInfo {
  available: boolean
  version?: string
  size?: number
  file_name?: string
}

export interface Device {
  id: number
  name: string
  created: number
  last_seen: number
  agent: string
}

export interface ConfigItem {
  key: string
  group: string
  label: string
  help: string
  kind: "addr" | "host" | "int" | "ro"
  extra: { min?: number; max?: number }
  value: string
  running: string
}

export interface ConfigView {
  file: string
  helper: boolean
  items: ConfigItem[]
  public_url: string | null
  readable: boolean
}

export interface UpdateStatus {
  available: boolean
  helper: boolean
  staged: string | null
  pending: boolean
  result: string | null
  current: string
  /** si installano solo pacchetti firmati (chiave nel programma) */
  signing: boolean
  log?: string
  log_len?: number
}

export interface SystemInfo {
  version: string
  started: number
  now: number
  database: string
  db_size: number
  users: number
  sessions: number
  os: string
  hostname: string
  update: UpdateStatus
}
