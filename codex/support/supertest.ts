import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage, IncomingHttpHeaders, Server } from 'node:http';

type HandlerResult = {
  status: number;
  headers: Record<string, string>;
  text: string;
  body: unknown;
};

type HandlerTarget = {
  handle(
    method: string,
    path: string,
    options: { headers: HeaderMap; body?: unknown },
  ): Promise<HandlerResult>;
};

export type RequestTarget = Server | string | HandlerTarget;

export type SupertestResponse = {
  status: number;
  statusCode: number;
  headers: Record<string, string>;
  text: string;
  body: unknown;
  raw: IncomingMessage | null;
};

type HeaderMap = Record<string, string>;

type QueryParams = Record<string, string | number | boolean | undefined>;

const listeningMap = new WeakMap<Server, Promise<void>>();

class TestRequest implements PromiseLike<SupertestResponse> {
  private headers: HeaderMap = {};
  private body: unknown;
  private queryString: string | null = null;

  constructor(private readonly target: RequestTarget, private readonly method: string, private readonly path: string) {}

  set(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  query(params: QueryParams | string): this {
    if (typeof params === 'string') {
      this.queryString = params.startsWith('?') ? params : `?${params}`;
      return this;
    }
    const entries = Object.entries(params)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    this.queryString = entries.length ? `?${entries.join('&')}` : null;
    return this;
  }

  send(payload: unknown): this {
    this.body = payload;
    return this;
  }

  then<TResult1 = SupertestResponse, TResult2 = never>(
    onFulfilled?: ((value: SupertestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onFulfilled as any, onRejected as any);
  }

  catch<TResult = never>(
    onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): Promise<SupertestResponse | TResult> {
    return this.execute().catch(onRejected as any);
  }

  private async execute(): Promise<SupertestResponse> {
    if (isHandlerTarget(this.target)) {
      const headers = { ...this.headers };
      if (!headers['accept']) {
        headers['accept'] = 'application/json';
      }
      const result = await this.target.handle(this.method, this.applyQuery(this.path), {
        headers,
        body: this.body,
      });
      return {
        status: result.status,
        statusCode: result.status,
        headers: normalizeHeadersRecord(result.headers),
        text: result.text,
        body: result.body,
        raw: null,
      };
    }

    const url = await resolveUrl(this.target, this.applyQuery(this.path));
    const headers = { ...this.headers };
    if (!headers['accept']) {
      headers['accept'] = 'application/json';
    }
    let bodyToSend: string | Buffer | undefined;
    if (this.body !== undefined) {
      if (typeof this.body === 'string' || Buffer.isBuffer(this.body)) {
        bodyToSend = this.body;
      } else {
        bodyToSend = JSON.stringify(this.body);
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
      }
      headers['content-length'] = Buffer.byteLength(bodyToSend).toString();
    }

    const isHttps = url.startsWith('https://');
    const requester = isHttps ? httpsRequest : httpRequest;

    return new Promise<SupertestResponse>((resolve, reject) => {
      const req = requester(url, { method: this.method, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const text = buffer.toString('utf8');
          const headers = normalizeHeaders(res.headers);
          const body = parseBody(text, headers['content-type']);
          resolve({
            status: res.statusCode ?? 0,
            statusCode: res.statusCode ?? 0,
            headers,
            text,
            body,
            raw: res,
          });
        });
      });
      req.on('error', reject);
      if (bodyToSend) {
        req.write(bodyToSend);
      }
      req.end();
    });
  }

  private applyQuery(path: string): string {
    if (!this.queryString) return path;
    if (path.includes('?')) {
      return `${path}&${this.queryString.replace(/^\?/, '')}`;
    }
    return `${path}${this.queryString}`;
  }
}

class SupertestAgent {
  constructor(private readonly target: RequestTarget) {}

  get(path: string): TestRequest {
    return new TestRequest(this.target, 'GET', path);
  }

  post(path: string): TestRequest {
    return new TestRequest(this.target, 'POST', path);
  }

  put(path: string): TestRequest {
    return new TestRequest(this.target, 'PUT', path);
  }

  delete(path: string): TestRequest {
    return new TestRequest(this.target, 'DELETE', path);
  }
}

export default function request(target: RequestTarget): SupertestAgent {
  return new SupertestAgent(target);
}

async function resolveUrl(target: RequestTarget, path: string): Promise<string> {
  if (typeof target === 'string') {
    return joinUrl(target, path);
  }
  await ensureListening(target);
  const addr = target.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Unable to resolve server address');
  }
  const host = addr.address && addr.address !== '::' ? addr.address : '127.0.0.1';
  return `http://${host}:${addr.port}${path}`;
}

async function ensureListening(server: Server): Promise<void> {
  if (server.listening) return;
  let pending = listeningMap.get(server);
  if (!pending) {
    pending = new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, () => {
        server.off('error', reject);
        resolve();
      });
    });
    listeningMap.set(server, pending);
  }
  await pending;
}

function joinUrl(base: string, path: string): string {
  if (!base.endsWith('/') && !path.startsWith('/')) {
    return `${base}/${path}`;
  }
  if (base.endsWith('/') && path.startsWith('/')) {
    return `${base}${path.slice(1)}`;
  }
  return `${base}${path}`;
}

function normalizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

function normalizeHeadersRecord(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}

function parseBody(text: string, contentType?: string): unknown {
  if (!text) return '';
  if (!contentType) return text;
  if (contentType.includes('application/json')) {
    try {
      return text.length ? JSON.parse(text) : null;
    } catch {
      return text;
    }
  }
  return text;
}

export { TestRequest };

function isHandlerTarget(target: RequestTarget): target is HandlerTarget {
  return typeof target === 'object' && target !== null && 'handle' in target && typeof (target as any).handle === 'function';
}
