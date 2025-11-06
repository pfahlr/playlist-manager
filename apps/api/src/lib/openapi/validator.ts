import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { problem } from '../problem.js';

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head';

type ReferenceObject = { $ref: string };

type SchemaObject = {
  type?: string | string[];
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  allOf?: Schema[];
  not?: Schema;
  additionalProperties?: boolean | Schema;
  pattern?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  const?: unknown;
  description?: string;
};

type Schema = SchemaObject | ReferenceObject | boolean;

type MediaTypeObject = {
  schema?: Schema;
};

type ResponseObject = {
  content?: Record<string, MediaTypeObject>;
};

type OperationObject = {
  responses?: Record<string, ResponseObject | ReferenceObject>;
};

type PathItemObject = Partial<Record<HttpMethod, OperationObject>>;

type ComponentsObject = {
  schemas?: Record<string, Schema>;
  responses?: Record<string, ResponseObject | ReferenceObject>;
};

type OpenAPIDocument = {
  paths?: Record<string, PathItemObject>;
  components?: ComponentsObject;
};

type OperationKey = `${Uppercase<HttpMethod>} ${string}`;

type CompiledResponse = {
  hasContent: boolean;
  contentSchemas: Map<string, Schema>;
};

type ValidationInput = {
  method?: string;
  path?: string | null;
  statusCode: number;
  contentType?: string;
  body: unknown;
};

type ValidationError = {
  path: string;
  message: string;
};

type ValidationResult =
  | { ok: true }
  | { ok: false; message: string; errors: ValidationError[] };

type FastifyLikeRequest = {
  method?: string;
  routeOptions?: { url?: string };
  routerPath?: string;
  context?: { config?: { url?: string } };
};

type FastifyLikeReply = {
  statusCode: number;
  getHeader(name: string): unknown;
};

type PreSerializationHook = (
  request: FastifyLikeRequest,
  reply: FastifyLikeReply,
  payload: unknown,
) => Promise<unknown> | unknown;

const SPEC_JSON_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'openapi.json',
);

const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

class OpenApiResponseValidator {
  private readonly document: OpenAPIDocument;
  private readonly responses: Map<OperationKey, Map<string, CompiledResponse>>;
  private readonly schemaValidator: SchemaValidator;

  constructor(document: OpenAPIDocument, responses: Map<OperationKey, Map<string, CompiledResponse>>) {
    this.document = document;
    this.responses = responses;
    this.schemaValidator = new SchemaValidator(document);
  }

  validate(input: ValidationInput): ValidationResult {
    const method = input.method?.toUpperCase();
    if (!method || !input.path) {
      return { ok: true };
    }

    const operationKey = `${method} ${input.path}` as OperationKey;
    const responseMap = this.responses.get(operationKey);
    if (!responseMap) {
      return { ok: true };
    }

    const statusKey = String(input.statusCode);
    const response = responseMap.get(statusKey) ?? responseMap.get('default');
    if (!response) {
      return { ok: true };
    }

    if (!response.hasContent) {
      if (input.body === undefined || input.body === null || input.body === '') {
        return { ok: true };
      }
      return {
        ok: false,
        message: `Response validation failed for ${operationKey} status ${statusKey}: body not permitted`,
        errors: [],
      };
    }

    const contentType = normalizeContentType(input.contentType);
    const schema =
      response.contentSchemas.get(contentType) ??
      response.contentSchemas.get('application/json');

    if (!schema) {
      return { ok: true };
    }

    const errors = this.schemaValidator.validate(schema, input.body, '');
    if (errors.length === 0) {
      return { ok: true };
    }

    return {
      ok: false,
      message: `Response validation failed for ${operationKey} status ${statusKey}`,
      errors,
    };
  }
}

class SchemaValidator {
  private readonly document: OpenAPIDocument;

  constructor(document: OpenAPIDocument) {
    this.document = document;
  }

  validate(schema: Schema, value: unknown, path: string): ValidationError[] {
    return this.validateSchema(schema, value, path, new Set<string>());
  }

  private validateSchema(schema: Schema, value: unknown, path: string, refStack: Set<string>): ValidationError[] {
    if (typeof schema === 'boolean') {
      if (schema) {
        return [];
      }
      return [{ path, message: 'must NOT be present' }];
    }

    if (isReferenceObject(schema)) {
      const ref = schema.$ref;
      if (refStack.has(ref)) {
        return [];
      }
      const target = resolveRef(this.document, ref);
      if (!target) {
        return [{ path, message: `unresolvable reference ${ref}` }];
      }
      refStack.add(ref);
      const result = this.validateSchema(target as Schema, value, path, refStack);
      refStack.delete(ref);
      return result;
    }

    const errors: ValidationError[] = [];
    const allowedTypes = normalizeTypes(schema.type);
    if (allowedTypes && allowedTypes.length > 0) {
      const matches = allowedTypes.some((type) => matchesType(type, value));
      if (!matches) {
        errors.push({
          path,
          message: `must be of type ${allowedTypes.join(' or ')}`,
        });
        return errors;
      }
    }

    if (schema.enum) {
      const isMember = schema.enum.some((entry) => deepEqual(entry, value));
      if (!isMember) {
        errors.push({ path, message: `must be equal to one of the allowed values` });
      }
    }

    if (schema.const !== undefined && !deepEqual(schema.const, value)) {
      errors.push({ path, message: `must be equal to constant value` });
    }

    const actualType = detectType(value);

    if (actualType === 'object' && schema.properties) {
      const data = value as Record<string, unknown>;
      const requiredList = schema.required ?? [];
      for (const requiredKey of requiredList) {
        if (!data || data[requiredKey] === undefined) {
          errors.push({
            path,
            message: `must have required property '${requiredKey}'`,
          });
        }
      }

      for (const [key, propertySchema] of Object.entries(schema.properties)) {
        if (data && data[key] !== undefined) {
          const childPath = joinPath(path, key);
          errors.push(...this.validateSchema(propertySchema, data[key], childPath, refStack));
        }
      }

      const propertyKeys = new Set(Object.keys(schema.properties));
      if (schema.additionalProperties === false && data) {
        for (const key of Object.keys(data)) {
          if (!propertyKeys.has(key)) {
            errors.push({
              path,
              message: `must NOT have additional property '${key}'`,
            });
          }
        }
      } else if (schema.additionalProperties && schema.additionalProperties !== true && data) {
        for (const key of Object.keys(data)) {
          if (!propertyKeys.has(key)) {
            const childPath = joinPath(path, key);
            errors.push(
              ...this.validateSchema(schema.additionalProperties, data[key], childPath, refStack),
            );
          }
        }
      }
    }

    if (actualType === 'array' && schema.items) {
      const data = Array.isArray(value) ? value : [];
      const itemSchema = schema.items;
      data.forEach((entry, index) => {
        const childPath = joinPath(path, String(index));
        errors.push(...this.validateSchema(itemSchema, entry, childPath, refStack));
      });

      if (schema.minItems !== undefined && data.length < schema.minItems) {
        errors.push({
          path,
          message: `must NOT have fewer than ${schema.minItems} items`,
        });
      }
      if (schema.maxItems !== undefined && data.length > schema.maxItems) {
        errors.push({
          path,
          message: `must NOT have more than ${schema.maxItems} items`,
        });
      }
      if (schema.uniqueItems) {
        const seen = new Set<string>();
        for (const entry of data) {
          const signature = JSON.stringify(entry);
          if (seen.has(signature)) {
            errors.push({ path, message: 'must NOT contain duplicate items' });
            break;
          }
          seen.add(signature);
        }
      }
    }

    if (actualType === 'string') {
      const str = value as string;
      if (schema.minLength !== undefined && str.length < schema.minLength) {
        errors.push({
          path,
          message: `length must be >= ${schema.minLength}`,
        });
      }
      if (schema.maxLength !== undefined && str.length > schema.maxLength) {
        errors.push({
          path,
          message: `length must be <= ${schema.maxLength}`,
        });
      }
      if (schema.pattern) {
        const regex = new RegExp(schema.pattern);
        if (!regex.test(str)) {
          errors.push({
            path,
            message: `must match pattern ${schema.pattern}`,
          });
        }
      }
    }

    if (actualType === 'number' || actualType === 'integer') {
      const num = value as number;
      if (schema.minimum !== undefined && num < schema.minimum) {
        errors.push({
          path,
          message: `must be >= ${schema.minimum}`,
        });
      }
      if (schema.exclusiveMinimum !== undefined && num <= schema.exclusiveMinimum) {
        errors.push({
          path,
          message: `must be > ${schema.exclusiveMinimum}`,
        });
      }
      if (schema.maximum !== undefined && num > schema.maximum) {
        errors.push({
          path,
          message: `must be <= ${schema.maximum}`,
        });
      }
      if (schema.exclusiveMaximum !== undefined && num >= schema.exclusiveMaximum) {
        errors.push({
          path,
          message: `must be < ${schema.exclusiveMaximum}`,
        });
      }
      if (schema.multipleOf !== undefined && num % schema.multipleOf !== 0) {
        errors.push({
          path,
          message: `must be a multiple of ${schema.multipleOf}`,
        });
      }
    }

    if (schema.oneOf && schema.oneOf.length > 0) {
      let validCount = 0;
      for (const variant of schema.oneOf) {
        const variantErrors = this.validateSchema(variant, value, path, refStack);
        if (variantErrors.length === 0) {
          validCount += 1;
        }
      }
      if (validCount !== 1) {
        errors.push({ path, message: 'must match exactly one schema in oneOf' });
      }
    }

    if (schema.anyOf && schema.anyOf.length > 0) {
      let satisfied = false;
      for (const variant of schema.anyOf) {
        const variantErrors = this.validateSchema(variant, value, path, refStack);
        if (variantErrors.length === 0) {
          satisfied = true;
          break;
        }
      }
      if (!satisfied) {
        errors.push({ path, message: 'must match at least one schema in anyOf' });
      }
    }

    if (schema.allOf && schema.allOf.length > 0) {
      for (const variant of schema.allOf) {
        errors.push(...this.validateSchema(variant, value, path, refStack));
      }
    }

    if (schema.not) {
      const notErrors = this.validateSchema(schema.not, value, path, refStack);
      if (notErrors.length === 0) {
        errors.push({ path, message: 'must NOT match schema in not' });
      }
    }

    return errors;
  }
}

let cachedValidator: Promise<OpenApiResponseValidator> | null = null;
let cachedDocument: Promise<OpenAPIDocument> | null = null;

async function getValidatorInstance(): Promise<OpenApiResponseValidator> {
  if (!cachedValidator) {
    cachedValidator = loadSpec().then(buildValidator);
  }
  return cachedValidator;
}

async function loadSpec(): Promise<OpenAPIDocument> {
  if (!cachedDocument) {
    cachedDocument = (async () => {
      const raw = await readFile(SPEC_JSON_PATH, 'utf8');
      return JSON.parse(raw) as OpenAPIDocument;
    })();
  }
  return cachedDocument;
}

function buildValidator(document: OpenAPIDocument): OpenApiResponseValidator {
  const operations: Map<OperationKey, Map<string, CompiledResponse>> = new Map();
  const paths = document.paths ?? {};

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const responsesMap: Map<string, CompiledResponse> = new Map();
      const responses = operation.responses ?? {};
      for (const [statusKey, responseOrRef] of Object.entries(responses)) {
        const resolved = resolveResponse(document, responseOrRef);
        if (!resolved) continue;
        const content = resolved.content ?? {};
        const contentSchemas = new Map<string, Schema>();
        let hasContent = false;
        for (const [contentType, mediaType] of Object.entries(content)) {
          if (!mediaType || mediaType.schema === undefined) continue;
          hasContent = true;
          contentSchemas.set(normalizeContentType(contentType), mediaType.schema);
        }
        responsesMap.set(statusKey, {
          hasContent,
          contentSchemas,
        });
      }

      if (responsesMap.size > 0) {
        const operationKey = `${method.toUpperCase()} ${pathKey}` as OperationKey;
        operations.set(operationKey, responsesMap);
      }
    }
  }

  return new OpenApiResponseValidator(document, operations);
}

function resolveResponse(
  document: OpenAPIDocument,
  responseOrRef: ResponseObject | ReferenceObject,
): ResponseObject | null {
  if (!responseOrRef) return null;
  if (!isReferenceObject(responseOrRef)) {
    return responseOrRef;
  }
  const target = resolveRef(document, responseOrRef.$ref);
  return (target ?? null) as ResponseObject | null;
}

function resolveRef(document: OpenAPIDocument, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    throw new Error(`Only local $ref values are supported (received: ${ref})`);
  }
  const segments = ref
    .slice(2)
    .split('/')
    .map(unescapeJsonPointer);

  let current: any = document;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      return null;
    }
  }
  return current;
}

function unescapeJsonPointer(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~');
}

function normalizeContentType(value?: string): string {
  if (!value) {
    return 'application/json';
  }
  return value.split(';')[0]?.trim().toLowerCase() || 'application/json';
}

function headerValueToString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return undefined;
}

function coercePayload(payload: unknown, contentType: string): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }
  if (typeof payload === 'string') {
    if (contentType.includes('json')) {
      try {
        return JSON.parse(payload);
      } catch {
        return payload;
      }
    }
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    if (contentType.includes('json')) {
      try {
        return JSON.parse(payload.toString('utf8'));
      } catch {
        return payload;
      }
    }
    return payload;
  }
  return payload;
}

function extractRouteUrl(request: FastifyLikeRequest): string | null {
  if (request?.routeOptions?.url) return request.routeOptions.url;
  if (request?.routerPath) return request.routerPath;
  if (request?.context?.config?.url) return request.context.config.url;
  return null;
}

function toOpenApiPath(routeUrl: string): string {
  return routeUrl.replace(/:([^/]+)/g, '{$1}');
}

function joinPath(base: string, fragment: string): string {
  if (!base) return `/${escapeJsonPointer(fragment)}`;
  return `${base}/${escapeJsonPointer(fragment)}`;
}

function escapeJsonPointer(fragment: string): string {
  return fragment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function normalizeTypes(type?: string | string[]): string[] | null {
  if (!type) return null;
  return Array.isArray(type) ? type : [type];
}

function matchesType(expected: string, value: unknown): boolean {
  switch (expected) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function detectType(value: unknown): 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'unknown' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number';
  }
  if (value && typeof value === 'object') return 'object';
  return 'unknown';
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) {
    return Object.is(a, b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!deepEqual((a as any)[key], (b as any)[key])) return false;
  }
  return true;
}

function isReferenceObject(value: Schema | ResponseObject | ReferenceObject): value is ReferenceObject {
  return typeof value === 'object' && value !== null && '$ref' in value;
}

export async function createResponseValidationHook(): Promise<PreSerializationHook> {
  const validator = await getValidatorInstance();

  const hook: PreSerializationHook = async (request, reply, payload) => {
    const routeUrl = extractRouteUrl(request);
    const openApiPath = routeUrl ? toOpenApiPath(routeUrl) : null;
    const contentHeader = headerValueToString(reply.getHeader('content-type'));

    const result = validator.validate({
      method: request.method,
      path: openApiPath,
      statusCode: reply.statusCode,
      contentType: contentHeader,
      body: coercePayload(payload, normalizeContentType(contentHeader)),
    });

    if (!result.ok) {
      throw problem({
        status: 500,
        code: 'contract_validation_failed',
        message: result.message,
        details: { errors: result.errors },
      });
    }

    return payload;
  };

  return hook;
}
