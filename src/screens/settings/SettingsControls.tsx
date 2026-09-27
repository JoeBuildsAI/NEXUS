import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A settings section: large editorial title, generous rhythm, hairline rows. */
export function SettingsSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-display-md font-semibold uppercase tracking-wide2 text-white">{title}</h2>
      {description && <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-white/40">{description}</p>}
      <div className="mt-10 divide-y divide-white/[0.05]">{children}</div>
    </section>
  );
}

export function SettingRow({ label, description, children, className }: { label: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-12 py-5", className)}>
      <div className="min-w-0 max-w-xl">
        <p className="text-[15px] text-white/85">{label}</p>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-white/40">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Text-only segmented control: no box, moving underline. */
export function Select<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-5", className)} role="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} role="radio" aria-checked={active} onClick={() => onChange(o.value)} className={cn("relative pb-1 text-[13px] transition-colors", active ? "text-white" : "text-white/35 hover:text-white/75")}>
            {o.label}
            {active && <span className="absolute inset-x-0 -bottom-px h-px bg-white" />}
          </button>
        );
      })}
    </div>
  );
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 border-b border-white/12 bg-transparent px-0 text-sm text-white/90 placeholder:text-white/25 transition-colors focus:border-white/60 focus:outline-none disabled:opacity-40",
        className,
      )}
    />
  );
}
