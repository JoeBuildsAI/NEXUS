import pkg from "../../package.json";

/** Single source of truth for the UI; kept in sync with tauri.conf.json and Cargo.toml. */
export const APP_VERSION: string = pkg.version;
