import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/**
 * Monochrome button language.
 *  primary  — white surface, black text: the one call to action on a screen
 *  outline  — hairline, for secondary actions
 *  subtle   — faint surface, for grouped controls
 *  ghost    — text only
 *  danger   — restrained red text, hairline
 */
const variants: Record<Variant, string> = {
  primary: "bg-white text-black hover:bg-white/90 active:bg-white/80 font-medium",
  outline: "text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)] hover:bg-white/[0.03]",
  subtle: "bg-white/[0.05] text-white/80 hover:bg-white/[0.09] hover:text-white",
  ghost: "text-white/60 hover:text-white hover:bg-white/[0.05]",
  danger: "text-status-critical/90 shadow-[inset_0_0_0_1px_rgba(217,107,107,0.25)] hover:bg-status-critical/10 hover:text-status-critical",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "ghost", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "no-drag inline-flex items-center justify-center whitespace-nowrap transition-[background-color,box-shadow,color,transform] duration-200 ease-nexus",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
        "disabled:opacity-35 disabled:pointer-events-none active:scale-[0.985]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
