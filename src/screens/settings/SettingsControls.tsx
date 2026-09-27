import type { ReactNode } from "react";
import { Panel } from "@/components/ui";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold tracking-wide2 text-white/90">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-white/40">{description}</p>}
      <Panel className="mt-4 divide-y divide-white/[0.04]">{children}</Panel>
    </div>
  );
}

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <p className="text-sm text-white/85">{label}</p>
        {description && <p className="mt-0.5 text-xs text-white/40">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
