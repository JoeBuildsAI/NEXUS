import { Component, type ErrorInfo, type ReactNode } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("ui");

interface Props {
  children: ReactNode;
  /** Compact inline fallback for embedded surfaces. */
  inline?: boolean;
  label?: string;
}
interface State {
  error: Error | null;
  showDetails: boolean;
}

/** Sanitize an error message: no stack frames, file paths, or JSON blobs. */
export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  return raw
    .split("\n")[0]!
    .replace(/[A-Za-z]:\\[^\s"']+/g, "[path]")
    .replace(/\/[^\s"']+\.(ts|tsx|js|rs)(:\d+)?/g, "[source]")
    .replace(/\{[^}]*\}/g, "[data]")
    .slice(0, 200);
}

/**
 * Contains render errors so a single surface can never black out the app.
 * Errors are shown as ACTION FAILED with optional sanitized detail.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("Surface crashed", { label: this.props.label, error: sanitizeErrorMessage(error), stack: info.componentStack?.split("\n").slice(0, 3).join(" ") });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const retry = () => this.setState({ error: null, showDetails: false });
    const detail = sanitizeErrorMessage(this.state.error);

    if (this.props.inline) {
      return (
        <div className="py-3 text-[13px] text-white/45">
          <p><span className="text-micro text-white/35">Unavailable</span> · {this.props.label ?? "This section"} couldn't render.</p>
          <div className="mt-1.5 flex gap-4 text-[12px]">
            <button onClick={retry} className="text-white/60 hover:text-white">Try again</button>
            <button onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))} className="text-white/35 hover:text-white">Details</button>
          </div>
          {this.state.showDetails && <p className="mt-2 font-mono text-[11px] text-white/35" data-selectable="true">{detail}</p>}
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center px-12">
        <div className="max-w-md">
          <p className="text-micro tracking-cinematic text-white/35">Action failed</p>
          <p className="mt-3 font-display text-display-md font-semibold uppercase tracking-wide text-white/85">NEXUS couldn't render this</p>
          <p className="mt-4 text-[14px] leading-relaxed text-white/40">{this.props.label ?? "This screen"} hit an unexpected error and was contained. The rest of NEXUS is unaffected.</p>
          <div className="mt-8 flex items-center gap-5 text-[13px]">
            <button onClick={retry} className="rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-white/90">Try again</button>
            <button onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))} className="text-white/45 hover:text-white">Details</button>
          </div>
          {this.state.showDetails && <p className="mt-5 font-mono text-[11.5px] leading-relaxed text-white/40" data-selectable="true">{detail}</p>}
        </div>
      </div>
    );
  }
}
