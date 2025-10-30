#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] !== 'run') {
    console.error('Usage: schemathesis run <spec> [options]');
    process.exit(1);
  }

  const specPath = argv[1];
  if (!specPath) {
    console.error('Missing OpenAPI spec path');
    process.exit(1);
  }

  const result = {
    specPath,
    baseUrl: '',
    headers: {},
    operationIds: [],
  };

  const skipValueFor = new Set([
    '--checks',
    '--phases',
    '--hypothesis-deadline',
    '--operations-file',
    '--base-url',
  ]);

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg.startsWith('--url=')) {
      result.baseUrl = arg.slice('--url='.length);
      continue;
    }
    if (arg === '--url') {
      result.baseUrl = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg.startsWith('--include-operation-id=')) {
      result.operationIds.push(arg.slice('--include-operation-id='.length));
      continue;
    }
    if (arg === '--include-operation-id') {
      const opId = argv[i + 1];
      if (opId) {
        result.operationIds.push(opId);
        i += 1;
      }
      continue;
    }
    if (arg === '-H' || arg === '--header') {
      const header = argv[i + 1];
      if (header) {
        addHeader(result.headers, header);
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('-H')) {
      addHeader(result.headers, arg.slice(2));
      continue;
    }
    if (arg.startsWith('--header=')) {
      addHeader(result.headers, arg.slice('--header='.length));
      continue;
    }
    if (skipValueFor.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      // ignore other long-form flags
      continue;
    }
  }

  if (!result.baseUrl) {
    result.baseUrl = 'http://127.0.0.1:4010';
  }

  return result;
}

function addHeader(target, value) {
  if (!value) return;
  const [name, ...rest] = value.split(':');
  if (!name || rest.length === 0) return;
  target[name.trim().toLowerCase()] = rest.join(':').trim();
}

function pickExample(content) {
  if (!content || typeof content !== 'object') return undefined;
  const keys = Object.keys(content);
  const jsonKey = keys.find((key) => key.toLowerCase().startsWith('application/json'));
  const entry = jsonKey ? content[jsonKey] : undefined;
  if (!entry || typeof entry !== 'object') return undefined;

  if (entry.examples && typeof entry.examples === 'object') {
    for (const value of Object.values(entry.examples)) {
      if (value && typeof value === 'object' && 'value' in value) {
        return value.value;
      }
    }
  }
  if ('example' in entry) {
    return entry.example;
  }
  if (entry.schema && typeof entry.schema === 'object' && 'default' in entry.schema) {
    return entry.schema.default;
  }
  return undefined;
}

function getExampleFromParam(param) {
  if (!param || typeof param !== 'object') return undefined;
  if ('example' in param && param.example !== undefined) {
    return param.example;
  }
  if (param.examples && typeof param.examples === 'object') {
    for (const ex of Object.values(param.examples)) {
      if (ex && typeof ex === 'object' && 'value' in ex) {
        return ex.value;
      }
    }
  }
  const schema = param.schema;
  if (schema && typeof schema === 'object') {
    if ('example' in schema && schema.example !== undefined) return schema.example;
    if ('default' in schema && schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
    if (schema.type === 'integer' || schema.type === 'number') return 1;
    if (schema.type === 'boolean') return true;
  }
  return undefined;
}

function ensurePathParams(pathTemplate, params) {
  const replacements = new Map();
  for (const param of params) {
    if (param && param.in === 'path' && param.name) {
      const value = getExampleFromParam(param);
      if (value === undefined) {
        throw new Error(`Missing example for path parameter "${param.name}" in ${pathTemplate}`);
      }
      replacements.set(param.name, value);
    }
  }
  return pathTemplate.replace(/\{([^}]+)\}/g, (_, name) => {
    if (!replacements.has(name)) {
      throw new Error(`No replacement for path parameter "${name}" in ${pathTemplate}`);
    }
    return encodeURIComponent(String(replacements.get(name)));
  });
}

function collectQueryParams(params) {
  const entries = [];
  for (const param of params) {
    if (!param || param.in !== 'query' || !param.name) continue;
    const value = getExampleFromParam(param);
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        entries.push([param.name, String(item)]);
      }
      continue;
    }
    entries.push([param.name, String(value)]);
  }
  return entries;
}

function successStatuses(responses) {
  if (!responses || typeof responses !== 'object') return [];
  return Object.keys(responses)
    .filter((code) => /^\d+$/.test(code))
    .map((code) => Number(code))
    .filter((code) => code >= 200 && code < 300);
}

async function main() {
  const { specPath, baseUrl, headers, operationIds } = parseArgs(process.argv.slice(2));
  const specFullPath = path.resolve(process.cwd(), specPath);
  const raw = await readFile(specFullPath, 'utf8');
  const doc = YAML.parse(raw);
  const paths = doc?.paths ?? {};

  const operations = new Map();
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const pathParams = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of Object.keys(pathItem)) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(method)) continue;
      const operation = pathItem[method];
      if (!operation || typeof operation !== 'object') continue;
      const opId = operation.operationId;
      if (!opId) continue;
      operations.set(opId, { method, path: pathKey, operation, pathParams });
    }
  }

  const targets = operationIds.length > 0 ? operationIds : Array.from(operations.keys());
  if (targets.length === 0) {
    console.error('No operations found to execute');
    process.exit(1);
  }

  for (const opId of targets) {
    const info = operations.get(opId);
    if (!info) {
      throw new Error(`OperationId "${opId}" not found in specification`);
    }
    const combinedParams = [
      ...info.pathParams,
      ...(Array.isArray(info.operation.parameters) ? info.operation.parameters : []),
    ];
    const resolvedPath = ensurePathParams(info.path, combinedParams);
    const queryEntries = collectQueryParams(combinedParams);
    const url = new URL(resolvedPath, baseUrl);
    for (const [name, value] of queryEntries) {
      url.searchParams.append(name, value);
    }

    let body;
    if (info.operation.requestBody) {
      const requestContent = info.operation.requestBody.content ?? {};
      const example = pickExample(requestContent);
      if (example === undefined && info.operation.requestBody.required) {
        throw new Error(`Missing example body for operation ${opId}`);
      }
      if (example !== undefined) {
        body = JSON.stringify(example);
      }
    }

    const expectedStatuses = successStatuses(info.operation.responses);
    if (expectedStatuses.length === 0) {
      throw new Error(`No successful responses defined for operation ${opId}`);
    }

    const requestHeaders = new Headers();
    requestHeaders.set('accept', 'application/json');
    if (body) {
      requestHeaders.set('content-type', 'application/json');
    }
    for (const [name, value] of Object.entries(headers)) {
      requestHeaders.set(name, value);
    }

    console.log(`→ ${info.method.toUpperCase()} ${url.toString()}`);
    const response = await fetch(url, {
      method: info.method.toUpperCase(),
      headers: requestHeaders,
      body,
    });

    if (!expectedStatuses.includes(response.status)) {
      const text = await response.text();
      throw new Error(
        `Unexpected status ${response.status} for ${opId}; expected one of ${expectedStatuses.join(', ')}. Body: ${text}`,
      );
    }

    console.log(`  ✓ ${opId} (${response.status})`);
  }

  console.log(`Completed ${targets.length} operation(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
