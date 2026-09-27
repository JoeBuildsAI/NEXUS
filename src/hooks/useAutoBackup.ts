import { useEffect } from "react";
import { useSettingsStore } from "@/state/settingsStore";
import { useLifeStore } from "@/state/lifeStore";
import { getLifeRepository, SqliteLifeRepository } from "@/providers/life";
import { native } from "@/providers/system/nativeBridge";
import { todayKey } from "@/core/life/time";
import { createLogger } from "@/lib/logger";

const log = createLogger("life-backup");

/** Optional daily local backup of the personal database (never uploaded). Runs once per calendar day while NEXUS is open. */
export function useAutoBackup() {
  useEffect(() => {
    const run = async () => {
      const { data, setData } = useSettingsStore.getState();
      if (!data.autoBackup) return;
      const today = todayKey();
      if (data.lastAutoBackupDay === today) return;
      const repo = getLifeRepository();
      if (!(repo instanceof SqliteLifeRepository) || useLifeStore.getState().status !== "ready") return;
      try {
        const target = await native.lifeBackupTarget();
        await repo.backupTo(target);
        await native.lifePruneBackups(data.keepBackups).catch(() => 0);
        setData({ lastAutoBackupDay: today });
        log.info("scheduled backup written");
      } catch (e) {
        log.warn("scheduled backup failed", { error: String((e as Error)?.message ?? e).slice(0, 120) });
      }
    };
    const id = setInterval(() => void run(), 5 * 60_000);
    const first = setTimeout(() => void run(), 20_000);
    return () => { clearInterval(id); clearTimeout(first); };
  }, []);
}
