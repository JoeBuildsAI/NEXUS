import { useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { SettingsSection, SettingRow } from "../SettingsControls";
import { Button, Toggle } from "@/components/ui";
import { useLifeStore } from "@/state/lifeStore";
import { useSettingsStore } from "@/state/settingsStore";
import { getLifeRepository, SqliteLifeRepository } from "@/providers/life";
import { createLifeExport, validateLifeImport } from "@/core/life/transfer";
import { LIFE_COLLECTIONS } from "@/core/life/models";
import { APP_VERSION } from "@/core/version";
import { config } from "@/core/config";
import { notify } from "@/state/toastStore";
import { requestConfirm } from "@/state/confirmStore";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import { native } from "@/providers/system/nativeBridge";
import { activity } from "@/state/activityStore";

const LABEL: Record<string, string> = { events: "Calendar events", tasks: "Tasks", routines: "Routines", routineCompletions: "Routine logs", exercises: "Exercises", workoutTemplates: "Workout templates", programs: "Programs", sessions: "Workout sessions", foods: "Foods", meals: "Meals", mealPlan: "Meal plan", groceries: "Grocery items", pantry: "Pantry" };

/** DATA — where personal data lives, sample data, export/import, backup/restore, wipe. */
export function DataSettings() {
  const life = useLifeStore();
  const { data, setData } = useSettingsStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [paths, setPaths] = useState<{ dbPath: string; backupDir: string; dbExists: boolean; dbBytes: number } | null>(null);
  const [backups, setBackups] = useState<{ path: string; name: string; bytes: number; modified: number }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const repo = getLifeRepository();
  const sqlite = repo instanceof SqliteLifeRepository ? repo : null;

  const refresh = async () => {
    if (!config.isTauri) return;
    setPaths(await native.lifePaths().catch(() => null));
    setBackups(await native.lifeBackups().catch(() => []));
  };
  useEffect(() => { void life.load(); void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const exportLife = async () => {
    const dump = await repo.dump();
    const ex = createLifeExport(dump, APP_VERSION, { includeDemo: false });
    const blob = new Blob([JSON.stringify(ex, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nexus-life-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    const n = Object.values(ex.counts).reduce((s, x) => s + (x ?? 0), 0);
    notify.success("Life data exported", `${n.toLocaleString()} records · no secrets, email or media paths.`);
  };
  const importLife = async (file: File) => {
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); } catch { notify.error("Import failed", "File is not valid JSON."); return; }
    const v = validateLifeImport(parsed);
    if (!v.ok || !v.dump) { notify.error("Import rejected", v.error ?? "Invalid file"); return; }
    const n = Object.values(v.counts).reduce((s, x) => s + (x ?? 0), 0);
    requestConfirm({
      title: "Import life data?",
      message: [`${n.toLocaleString()} records.`, ...v.warnings, "Merge keeps your current data and takes the newer copy of duplicates. Replace removes everything first."].join("\n"),
      confirmLabel: "Merge",
      secondaryLabel: "Replace",
      onConfirm: async () => { await life.importDump(v.dump!, "merge"); notify.success("Imported", "Merged into your data."); },
      onSecondary: () => requestConfirm({ title: "Replace all personal data?", message: "Current routines, workouts, meals, groceries, tasks and calendar are deleted first. Back up first if unsure.", confirmLabel: "Replace", danger: true, onConfirm: async () => { await life.importDump(v.dump!, "replace"); notify.success("Imported", "Replaced your data."); } }),
    });
  };
  const backupNow = async () => {
    if (!sqlite) return;
    setBusy("backup");
    try {
      const target = await native.lifeBackupTarget();
      await sqlite.backupTo(target);
      await native.lifePruneBackups(data.keepBackups).catch(() => 0);
      await refresh();
      activity.record("session-recovered", "Personal data backed up");
      notify.success("Backup written", "Stored locally in the NEXUS data folder. Nothing was uploaded.");
    } catch (e) {
      notify.error("Backup failed", String((e as Error)?.message ?? e).slice(0, 140));
    } finally { setBusy(null); }
  };
  const restore = (b: { path: string; name: string }) => {
    if (!sqlite) return;
    requestConfirm({
      title: "Restore this backup?",
      message: `${b.name}\n\nThe backup is integrity-checked first. Current personal data is replaced only if the check passes.`,
      confirmLabel: "Restore",
      danger: true,
      onConfirm: async () => {
        setBusy("restore");
        try {
          await native.lifeValidateBackup(b.path);
          const r = await sqlite.restoreFromFile(b.path);
          if (!r.ok) { notify.error("Restore refused", r.error ?? "Validation failed"); return; }
          await life.load({ force: true });
          notify.success("Restored", `${r.rows?.toLocaleString() ?? ""} rows from ${b.name}`);
        } finally { setBusy(null); }
      },
    });
  };
  const total = life.counts ? Object.values(life.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <SettingsSection title="Data" description="Personal data (routines, fitness, nutrition, meals, groceries, calendar, tasks) lives in a local SQLite database. Configuration, secrets and caches are stored separately. Nothing is uploaded.">
      <div className="py-5">
        <p className="text-[15px] text-white/85">Storage</p>
        <p className="mt-1 text-[13px] text-white/40">{repo.kind === "sqlite" ? `SQLite · ${paths?.dbExists ? formatBytes(paths.dbBytes, 0) : "not created yet"} · integrity ${sqlite?.integrity ?? "unknown"}` : "Browser preview · localStorage (the desktop build uses SQLite)"} · {total.toLocaleString()} records</p>
        {paths && <p className="mt-1 font-mono text-[11.5px] text-white/30" data-selectable="true">{paths.dbPath}</p>}
        <div className="mt-4 grid grid-cols-2 gap-x-10 gap-y-1 sm:grid-cols-3">
          {LIFE_COLLECTIONS.map((c) => <div key={c} className="flex items-baseline justify-between text-[12.5px]"><span className="text-white/45">{LABEL[c]}</span><span className="font-mono tabular text-white/70">{(life.counts?.[c] ?? 0).toLocaleString()}</span></div>)}
        </div>
      </div>

      <SettingRow label="Sample data" description={life.hasDemo ? "Sample rows are present. They are flagged and excluded from exports." : "Load clearly-labelled sample routines, workouts, meals, groceries, tasks and events to explore."}>
        {life.hasDemo ? <Button size="sm" variant="outline" onClick={() => void life.removeSampleData().then(() => notify.neutral("Sample data removed"))}>Remove sample data</Button> : <Button size="sm" variant="outline" onClick={() => void life.addSampleData()}>Load sample data</Button>}
      </SettingRow>

      <SettingRow label="Export life data" description="Versioned JSON you own: routines, workouts and history, foods, meals, plan, groceries, pantry, tasks, local calendar, targets. Never tokens, email, media paths or sample rows.">
        <Button size="sm" variant="outline" onClick={() => void exportLife()}><Download size={13} /> Export</Button>
      </SettingRow>
      <SettingRow label="Import life data" description="Validated before anything touches the database; sensitive-looking fields are stripped.">
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importLife(f); e.target.value = ""; }} />
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload size={13} /> Import</Button>
      </SettingRow>

      {sqlite ? (
        <>
          <SettingRow label="Back up NEXUS data" description={`Consistent snapshot of the database into the local backups folder. Keeps the newest ${data.keepBackups}.`}>
            <Button size="sm" variant="primary" disabled={busy != null} onClick={() => void backupNow()}>Back up now</Button>
          </SettingRow>
          <SettingRow label="Scheduled backup" description="Write a backup automatically once a day when NEXUS is open. Local only.">
            <Toggle checked={data.autoBackup} onChange={(v) => setData({ autoBackup: v })} />
          </SettingRow>
          <div className="py-5">
            <p className="text-[15px] text-white/85">Backups</p>
            {paths && <p className="mt-1 font-mono text-[11.5px] text-white/30" data-selectable="true">{paths.backupDir}</p>}
            {backups.length === 0 && <p className="mt-2 text-[13px] text-white/35">No backups yet.</p>}
            <ul className="mt-2 divide-y divide-white/[0.05]">
              {backups.map((b) => <li key={b.path} className="flex items-baseline gap-4 py-2 text-[13.5px]"><span className="font-mono text-white/75">{b.name}</span><span className="text-[12px] text-white/35">{formatBytes(b.bytes, 0)} · {formatRelativeTime(b.modified)}</span><button disabled={busy != null} onClick={() => restore(b)} className="ml-auto text-[12.5px] text-white/45 hover:text-white">Restore…</button></li>)}
            </ul>
          </div>
        </>
      ) : (
        <SettingRow label="Backups" description="Database backups are available in the desktop build."><span className="text-[12px] text-white/30">Desktop only</span></SettingRow>
      )}

      <SettingRow label="Delete all personal data" description="Removes every routine, workout, meal, grocery, task and local calendar event from this machine. Configuration and integrations are untouched.">
        <Button size="sm" variant="danger" onClick={() => requestConfirm({ title: "Delete all personal data?", message: `${total.toLocaleString()} records will be removed. This cannot be undone unless you have a backup or export.`, confirmLabel: "Delete everything", danger: true, onConfirm: () => void life.clearAllPersonalData().then(() => notify.neutral("Personal data deleted")) })}>Delete…</Button>
      </SettingRow>
    </SettingsSection>
  );
}
