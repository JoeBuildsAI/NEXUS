import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { createLogger } from "@/lib/logger";

const log = createLogger("ui");

interface Props {
  children: ReactNode;
  /** Short label for the region (shown in the fallback). */
  label?: string;
  /** Compact inline fallback for small surfaces. */
  inline?: boolean;
}
interface State {
  error: Error | null;
}

/**
 * Intentional error state. A failing surface renders a restrained fallback
 * instead of blanking the whole app; never shows raw stack traces to the user.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error("Surface crashed", { label: this.props.label, message: error.message, component: info.componentStack?.split("\n")[1]?.trim() });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const retry = () => this.setState({ error: null });
    if (this.props.inline) {
      return (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-white/[0.08] px-4 py-3 text-xs text-white/45">
          <AlertTriangle size={14} className="text-status-attention" />
          <span className="flex-1">{this.props.label ?? "This section"} couldn’t render.</span>
          <button onClick={retry} className="flex items-center gap-1 text-accent hover:underline"><RotateCcw size={11} /> Retry</button>
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center p-10 text-center">
        <div className="max-w-md">
          <AlertTriangle size={26} className="mx-auto text-status-attention" />
          <p className="mt-5 font-display text-2xl tracking-cinematic text-white/85">SURFACE FAULT</p>
          <p className="mt-3 text-sm leading-relaxed text-white/45">
            {this.props.label ?? "This screen"} hit an unexpected error and was contained. The rest of NEXUS is unaffected.
          </p>
          <button onClick={retry} className="mt-6 inline-flex items-center gap-2 rounded-xl border border-white/12 px-4 py-2 text-sm text-white/80 hover:border-white/25">
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      </div>
    );
  }
}
