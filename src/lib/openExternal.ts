/**
 * Open an https URL in the user's default browser through the validated native
 * command (scheme allowlist lives in Rust). Browser preview falls back to a
 * noopener window. Never used for links found inside email bodies.
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!/^https:\/\//i.test(url)) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_external", { url });
    return true;
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  }
}
