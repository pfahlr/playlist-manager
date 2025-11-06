type QueryMatcher = (query: Record<string, string>) => boolean;
type BodyMatcher = ((body: unknown) => boolean) | Record<string, unknown> | undefined;

interface ReplyConfig {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

const normalizePath = (basePath: string, path: string): string => {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  if (!basePath || basePath === '/') {
    return normalized;
  }
  return `${basePath.replace(/\/$/, '')}${normalized}`;
};

const parseQuery = (url: URL): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    result[key] = value;
  }
  return result;
};

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  if (a && b && typeof a === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) =>
      Object.prototype.hasOwnProperty.call(b, key) && deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }

  return false;
};

const parseBody = (body: BodyInit | null | undefined): unknown => {
  if (body === null || body === undefined) return undefined;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    try {
      const decoder = new TextDecoder();
      return parseBody(decoder.decode(body instanceof ArrayBuffer ? body : body.buffer));
    } catch {
      return undefined;
    }
  }
  return body;
};

const toQueryMatcher = (matcher: unknown): QueryMatcher => {
  if (typeof matcher === 'function') {
    return matcher as QueryMatcher;
  }
  if (matcher === true) {
    return () => true;
  }
  if (matcher && typeof matcher === 'object') {
    const expected = Object.entries(matcher as Record<string, string | number>)
      .reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = String(value);
        return acc;
      }, {});

    return (actual) => Object.entries(expected).every(([key, value]) => actual[key] === value);
  }
  return () => true;
};

const toBodyMatcher = (matcher: BodyMatcher): ((body: unknown) => boolean) | undefined => {
  if (!matcher) return undefined;
  if (typeof matcher === 'function') return matcher as (body: unknown) => boolean;
  return (body) => deepEqual(body, matcher as Record<string, unknown>);
};

let originalFetch: typeof globalThis.fetch | undefined;
let fetchPatched = false;

const installFetchMock = (handler: typeof fetch) => {
  if (fetchPatched) return;
  originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  fetchPatched = true;
};

const restoreFetch = () => {
  if (fetchPatched && originalFetch) {
    globalThis.fetch = originalFetch;
  }
  fetchPatched = false;
};

const respond = ({ status, body, headers }: ReplyConfig): Response => {
  const init: ResponseInit = { status, headers };
  if (body === undefined) {
    return new Response(null, init);
  }

  if (typeof body === 'object' && body !== null && !(body instanceof ArrayBuffer)) {
    const hdrs = new Headers(headers);
    if (!hdrs.has('content-type')) {
      hdrs.set('content-type', 'application/json');
    }
    return new Response(JSON.stringify(body), { ...init, headers: hdrs });
  }

  return new Response(String(body), init);
};

const activeInterceptors: Interceptor[] = [];

class Interceptor {
  private queryMatcher: QueryMatcher = () => true;
  private bodyMatcher?: (body: unknown) => boolean;
  private replyConfig?: ReplyConfig;
  private consumed = false;

  constructor(
    private readonly scope: Scope,
    private readonly method: string,
    private readonly path: string,
    bodyMatcher: BodyMatcher,
  ) {
    this.bodyMatcher = toBodyMatcher(bodyMatcher);
  }

  query(matcher: unknown): this {
    this.queryMatcher = toQueryMatcher(matcher);
    return this;
  }

  reply(status: number, body?: unknown, headers?: Record<string, string>): Scope {
    this.replyConfig = { status, body, headers };
    if (!activeInterceptors.includes(this)) {
      activeInterceptors.push(this);
    }
    installFetchMock(mockedFetch);
    return this.scope;
  }

  markConsumed() {
    this.consumed = true;
  }

  isConsumed(): boolean {
    return this.consumed;
  }

  matches(url: URL, method: string, body: BodyInit | null | undefined): boolean {
    if (method.toUpperCase() !== this.method) return false;
    if (url.origin !== this.scope.origin) return false;
    if (url.pathname !== this.path) return false;
    if (!this.queryMatcher(parseQuery(url))) return false;

    if (this.bodyMatcher) {
      return this.bodyMatcher(parseBody(body));
    }

    return true;
  }

  createResponse(): Response {
    if (!this.replyConfig) {
      throw new Error('Reply not configured for interceptor');
    }
    this.markConsumed();
    return respond(this.replyConfig);
  }
}

class Scope {
  readonly origin: string;
  private readonly interceptors: Set<Interceptor> = new Set();
  private readonly basePath: string;

  constructor(baseUrl: string) {
    const parsed = new URL(baseUrl);
    this.origin = parsed.origin;
    this.basePath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
  }

  private register(method: string, path: string, bodyMatcher?: BodyMatcher): Interceptor {
    const interceptor = new Interceptor(this, method, normalizePath(this.basePath, path), bodyMatcher);
    this.interceptors.add(interceptor);
    return interceptor;
  }

  get(path: string): Interceptor {
    return this.register('GET', path);
  }

  post(path: string, bodyMatcher?: BodyMatcher): Interceptor {
    return this.register('POST', path, bodyMatcher);
  }

  isDone(): boolean {
    for (const interceptor of this.interceptors) {
      if (!interceptor.isConsumed()) {
        return false;
      }
    }
    return true;
  }

  reset() {
    this.interceptors.clear();
  }
}

const scopes = new Set<Scope>();

const mockedFetch: typeof fetch = async (input, init) => {
  const requestUrl = (() => {
    if (typeof input === 'string') return new URL(input);
    if (input instanceof URL) return input;
    if (input && typeof input === 'object' && 'url' in input) {
      return new URL((input as Request).url);
    }
    throw new Error('Unsupported fetch input for nock mock');
  })();

  const method = (init?.method ?? ((input as Request)?.method ?? 'GET')).toUpperCase();
  const body = init?.body ?? (input instanceof Request ? input.body : undefined);

  for (let index = 0; index < activeInterceptors.length; index += 1) {
    const interceptor = activeInterceptors[index];
    if (interceptor.matches(requestUrl, method, init?.body)) {
      const response = interceptor.createResponse();
      activeInterceptors.splice(index, 1);
      return response;
    }
  }

  throw new Error(`No nock matched for ${method} ${requestUrl.toString()}`);
};

const createScope = (baseUrl: string): Scope => {
  const scope = new Scope(baseUrl);
  scopes.add(scope);
  return scope;
};

type NockFn = {
  (baseUrl: string): Scope;
  disableNetConnect(): void;
  enableNetConnect(): void;
  cleanAll(): void;
};

const nock: NockFn = Object.assign(createScope, {
  disableNetConnect: (): void => {
    installFetchMock(mockedFetch);
  },
  enableNetConnect: (): void => {
    restoreFetch();
  },
  cleanAll: (): void => {
    activeInterceptors.splice(0, activeInterceptors.length);
    for (const scope of scopes) {
      scope.reset();
    }
  },
});

export default nock;
