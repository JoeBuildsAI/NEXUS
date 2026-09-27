import type { ReactNode } from "react";

export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold tracking-wide2 text-white/90">{title}</h2>
      {description && <p className="mt-1 text-sm text-white/40">{description}</p>}
      <div className="mt-6 divide-y divide-white/[0.05]">{children}</div>
    </div>
  );
}

export function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 py-4">
      <div className="min-w-0">
        <p className="text-sm text-white/85">{label}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-white/40">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; disabled?: boolean }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-9 rounded-lg border border-white/[0.08] bg-void-800 px-3 text-sm text-white/85 focus:border-accent/40 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  );
}
