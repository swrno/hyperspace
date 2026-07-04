import type { HyperClientConfig } from './types.js';

const DEFAULT_BASE_URL = 'https://api.hypr.dev';

export class HyperApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HyperApiError';
  }
}

/** Shared request plumbing for every retriever/ingestor — auth headers + error handling. */
export abstract class HyperBase {
  protected readonly config: HyperClientConfig;

  constructor(config: HyperClientConfig) {
    for (const key of ['apiKey', 'appId', 'userId', 'clientId'] as const) {
      if (!config[key]) throw new Error(`HyperClient: missing required "${key}" in config`);
    }
    this.config = config;
  }

  protected async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const baseUrl = (this.config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.config.apiKey,
        'X-App-Id': this.config.appId,
        'X-Client-Id': this.config.clientId,
      },
      body: JSON.stringify({ userId: this.config.userId, ...body }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new HyperApiError(res.status, (detail as any)?.error || `Request to ${path} failed (${res.status})`);
    }
    return res.json() as Promise<T>;
  }
}
