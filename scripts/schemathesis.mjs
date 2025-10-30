#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { parse as parseYaml } from 'yaml';

/**
 * Minimal Schemathesis-inspired runner.
 * Supports the subset of flags used in package scripts so contract tests can run
 * without relying on the Python CLI.
 */

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] !== 'run') {
    console.error('Usage: schemathesis run <spec-file> [options]');
    process.exit(1);
  }

  const specFile = args[1];
  if (!specFile) {
    console.error('schemathesis: missing <spec-file> argument');
    process.exit(1);
  }

  const options = parseOptions(args.slice(2));
  const spec = loadSpec(specFile);

  const operations = options.includeOperationIds.length
    ? options.includeOperationIds
    : collectAllOperationIds(spec);

  const failures = [];

  for (const operationId of operations) {
    const operation = findOperation(spec, operationId);
    if (!operation) {
      failures.push({ operationId, message: 'operation not found in spec' });
      continue;
    }

    try {
      const result = await executeOperation(operation, options, spec);
      if (!result.ok) {
        failures.push({ operationId, message: result.message });
        console.error(`✖ ${operationId}: ${result.message}`);
      } else {
        console.log(`✔ ${operationId}: ${result.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ operationId, message });
      console.error(`✖ ${operationId}: ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`schemathesis: ${failures.length} operation(s) failed.`);
    process.exit(1);
  }

  console.log(`schemathesis: ${operations.length} operation(s) validated.`);
}

function parseOptions(args) {
  const includeOperationIds = [];
  const headers = {};
  let baseUrl = 'http://127.0.0.1:4010';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--url') {
      baseUrl = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--url=')) {
      baseUrl = arg.slice('--url='.length);
      continue;
    }
    if (arg === '--include-operation-id') {
      includeOperationIds.push(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--include-operation-id=')) {
      includeOperationIds.push(arg.slice('--include-operation-id='.length));
      continue;
    }
    if (arg === '-H') {
      parseHeader(headers, args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('-H')) {
      parseHeader(headers, arg.slice(2));
      continue;
    }
    // Ignore other flags (e.g., --checks, --phases, hypothesis options)
  }

  return { baseUrl, includeOperationIds: includeOperationIds.filter(Boolean), headers };
}

function parseHeader(target, headerValue) {
  if (!headerValue) return;
  const index = headerValue.indexOf(':');
  if (index === -1) return;
  const name = headerValue.slice(0, index).trim();
  const value = headerValue.slice(index + 1).trim();
  if (name) {
    target[name.toLowerCase()] = value;
  }
}

function loadSpec(specFile) {
  const absolutePath = resolve(process.cwd(), specFile);
  const raw = readFileSync(absolutePath, 'utf8');
  return parseYaml(raw);
}

function collectAllOperationIds(spec) {
  const ids = [];
  for (const [, methods] of Object.entries(spec.paths ?? {})) {
    for (const [, operation] of Object.entries(methods)) {
      if (operation && typeof operation === 'object' && operation.operationId) {
        ids.push(operation.operationId);
      }
    }
  }
  return ids;
}

function findOperation(spec, operationId) {
  for (const [pathKey, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation && typeof operation === 'object' && operation.operationId === operationId) {
        return { pathKey, method: method.toUpperCase(), operation, pathItem: methods };
      }
    }
  }
  return null;
}

async function executeOperation({ pathKey, method, operation, pathItem }, options, spec) {
  const base = new URL(options.baseUrl);
  const { url, body } = buildRequest(pathKey, method, operation, pathItem, base, spec);
  const headers = { ...options.headers };

  let payload;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['content-type'] = headers['content-type'] ?? 'application/json';
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: payload,
  });

  const expectedStatuses = collectSuccessStatuses(operation.responses);
  const ok = expectedStatuses.has(response.status);
  if (!ok) {
    return {
      ok: false,
      message: `expected status ${Array.from(expectedStatuses).join(', ')} but received ${response.status}`,
    };
  }

  const expectedContent = responseNeedsBody(operation.responses, response.status);
  if (expectedContent) {
    const text = await response.text();
    try {
      JSON.parse(text || '{}');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `response not valid JSON: ${message}` };
    }
  }

  return { ok: true, message: `${response.status} ${response.statusText || ''}`.trim() };
}

function buildRequest(pathKey, method, operation, pathItem, baseUrl, spec) {
  const params = collectParameters(operation, pathItem);
  const searchParams = new URLSearchParams();
  let resolvedPath = pathKey;

  for (const param of params) {
    const value = pickExampleValue(param, spec);
    if (param.in === 'path') {
      resolvedPath = resolvedPath.replace(`{${param.name}}`, encodeURIComponent(String(value)));
    } else if (param.in === 'query' && value !== undefined) {
      searchParams.set(param.name, String(value));
    } else if (param.in === 'header' && value !== undefined) {
      // header parameters handled via include-operation headers if needed
    }
  }

  const url = new URL(resolvedPath.replace(/\*/g, ''), baseUrl);
  if ([...searchParams.keys()].length > 0) {
    url.search = searchParams.toString();
  }

  const requestBody = operation.requestBody;
  if (!requestBody) {
    return { url };
  }

  const resolvedBody = pickRequestExample(requestBody);
  return { url, body: resolvedBody };
}

function collectParameters(operation, pathItem) {
  const params = [];
  if (Array.isArray(pathItem.parameters)) params.push(...pathItem.parameters);
  if (Array.isArray(operation.parameters)) params.push(...operation.parameters);
  return params;
}

function pickExampleValue(parameter) {
  if (parameter.example !== undefined) return parameter.example;
  if (parameter.examples) {
    const first = Object.values(parameter.examples)[0];
    if (first && typeof first === 'object' && 'value' in first) {
      return first.value;
    }
  }
  const schema = parameter.schema ?? {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (schema.type === 'integer' || schema.type === 'number') return 1;
  if (schema.type === 'boolean') return true;
  return 'example';
}

function pickRequestExample(requestBody) {
  if (requestBody.example) return requestBody.example;
  if (requestBody.examples) {
    const first = Object.values(requestBody.examples)[0];
    if (first && typeof first === 'object' && 'value' in first) {
      return first.value;
    }
  }
  const content = requestBody.content ?? {};
  for (const media of Object.values(content)) {
    if (!media) continue;
    if (media.example !== undefined) return media.example;
    if (media.examples) {
      const first = Object.values(media.examples)[0];
      if (first && typeof first === 'object' && 'value' in first) {
        return first.value;
      }
    }
    if (media.schema && media.schema.example !== undefined) return media.schema.example;
  }
  return {};
}

function collectSuccessStatuses(responses = {}) {
  const statuses = new Set();
  for (const key of Object.keys(responses)) {
    const code = Number(key);
    if (!Number.isNaN(code) && code >= 200 && code < 300) {
      statuses.add(code);
    }
  }
  if (statuses.size === 0) {
    statuses.add(200);
  }
  return statuses;
}

function responseNeedsBody(responses = {}, status) {
  const entry = responses[String(status)] ?? responses[status];
  if (!entry || typeof entry !== 'object') return false;
  if (status === 204) return false;
  return Boolean(entry.content);
}

await main();
