import type { Message, MessageCategory } from "@/core/types";

/**
 * OPTIONAL inbox intelligence boundary. The deterministic local classifier is
 * always the safety net; an intelligence provider only PROPOSES. Nothing here
 * can delete, archive, unsubscribe, move or create rules — proposals are
 * reviewed and executed by the user through the existing transaction flows.
 */
export type IntelligenceMode = "off" | "metadata" | "selected" | "full";

export interface IntelligenceStatus {
  configured: boolean;
  provider: string;
  mode: IntelligenceMode;
  /** Exactly what leaves the machine in the current mode. */
  dataPolicy: string;
}

export interface Proposal {
  id: string;
  kind: "classify" | "cleanup" | "rule" | "unsubscribe";
  title: string;
  rationale: string;
  /** Message ids or sender addresses the proposal concerns. */
  targets: string[];
  suggestedCategory?: MessageCategory;
  /** Always requires explicit approval; never auto-applied. */
  requiresApproval: true;
  source: "ai" | "heuristic";
}

export interface Narrative {
  text: string;
  /** Always labelled in the UI ("AI-generated" vs "deterministic"). */
  source: "ai" | "deterministic";
  generatedAt: number;
}

export interface InboxIntelligenceProvider {
  readonly id: string;
  status(): Promise<IntelligenceStatus>;
  summarizeMessage(message: Message): Promise<Narrative | null>;
  summarizeThread(messages: readonly Message[]): Promise<Narrative | null>;
  summarizeSelection(messages: readonly Message[]): Promise<Narrative | null>;
  /** "What actually mattered today?" over metadata (and bodies only in "full" mode). */
  summarizeDay(messages: readonly Message[]): Promise<Narrative | null>;
  suggestClassification(message: Message): Promise<Proposal | null>;
  suggestCleanup(messages: readonly Message[]): Promise<Proposal[]>;
  suggestRules(messages: readonly Message[]): Promise<Proposal[]>;
}

export const DATA_POLICY: Record<IntelligenceMode, string> = {
  off: "Nothing leaves this machine. Classification and summaries are deterministic and local.",
  metadata: "Only sender domains, categories, counts and timestamps would be sent — never subjects or bodies.",
  selected: "Only messages you explicitly select would be sent to the configured provider, one action at a time.",
  full: "Subjects and bodies of loaded mail could be sent for daily summaries. Only enable with a provider you trust.",
};

/**
 * The default: no provider configured. Every capability answers honestly with
 * null / empty — the UI shows "AI not configured" rather than inventing output.
 */
export class NoIntelligenceProvider implements InboxIntelligenceProvider {
  readonly id = "none";
  constructor(private mode: () => IntelligenceMode = () => "off") {}
  async status(): Promise<IntelligenceStatus> {
    return { configured: false, provider: "none", mode: this.mode(), dataPolicy: DATA_POLICY[this.mode()] };
  }
  async summarizeMessage() { return null; }
  async summarizeThread() { return null; }
  async summarizeSelection() { return null; }
  async summarizeDay() { return null; }
  async suggestClassification() { return null; }
  async suggestCleanup() { return []; }
  async suggestRules() { return []; }
}
