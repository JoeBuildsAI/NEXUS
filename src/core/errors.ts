/** Thrown by providers when their backing service is unavailable/offline. */
export class ProviderOfflineError extends Error {
  readonly provider: string;
  constructor(provider: string, message?: string) {
    super(message ?? `${provider} is offline`);
    this.name = "ProviderOfflineError";
    this.provider = provider;
  }
}

export function isOffline(err: unknown): err is ProviderOfflineError {
  return err instanceof ProviderOfflineError || (err instanceof Error && err.name === "ProviderOfflineError");
}
