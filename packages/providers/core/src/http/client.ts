export type HttpMethod = 'GET'|'POST'|'PUT'|'PATCH'|'DELETE';

export interface HttpClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  getAuthHeader?: () => Promise<string | undefined>;
  retries?: number;
  retryBaseMs?: number;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export class HttpClient {
  constructor(private opts: HttpClientOptions) {}

  async request<T>(method: HttpMethod, url: string, init?: RequestInit): Promise<T> {
    const { retries = 3, retryBaseMs = 300 } = this.opts;
    let attempt = 0;

    while (true) {
      const hdrs = new Headers(this.opts.headers);
      if (this.opts.getAuthHeader) {
        const h = await this.opts.getAuthHeader();
        if (h) hdrs.set('authorization', h);
      }
      if (init?.headers) {
        for (const [k, v] of Object.entries(init.headers as any)) hdrs.set(k, String(v));
      }

      const resp = await fetch(this.opts.baseUrl + url, { ...init, method, headers: hdrs });
      if (resp.status === 429 || resp.status >= 500) {
        if (attempt >= retries) throw new Error(`HTTP ${resp.status}`);
        const retryAfter = Number(resp.headers.get('retry-after') || 0);
        const backoff = retryAfter > 0 ? retryAfter * 1000 : retryBaseMs * Math.pow(2, attempt) + Math.random() * 100;
        attempt++;
        await sleep(backoff);
        continue;
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}: ${text.slice(0,200)}`);
      }
      return (await resp.json()) as T;
    }
  }
}
