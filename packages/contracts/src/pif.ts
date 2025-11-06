import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import { createRequire } from 'node:module';

export type PIFProviderService = 'spotify' | 'deezer' | 'tidal' | 'youtube' | 'amazon';

export interface PIFProviderIds {
  spotify_track_id?: string | null;
  deezer_track_id?: string | null;
  tidal_track_id?: string | null;
  youtube_video_id?: string | null;
  amazon_track_id?: string | null;
}

export interface PIFTrack {
  position: number;
  title: string;
  artists: string[];
  album?: string | null;
  duration_ms?: number | null;
  explicit?: boolean | null;
  release_date?: string | null;
  isrc?: string | null;
  mb_recording_id?: string | null;
  mb_release_id?: string | null;
  provider_ids?: PIFProviderIds;
}

export interface PIFDocument {
  name: string;
  description?: string | null;
  source_service?: PIFProviderService | null;
  source_playlist_id?: string | null;
  tracks: PIFTrack[];
}

export type PIFValidationSuccess = {
  success: true;
  data: PIFDocument;
  errors: [];
};

export type PIFValidationError = ErrorObject & { instancePath: string };

export type PIFValidationFailure = {
  success: false;
  errors: PIFValidationError[];
};

export type PIFValidationResult = PIFValidationSuccess | PIFValidationFailure;

type JsonObject = Record<string, unknown>;

type CompiledValidator = {
  validate: ValidateFunction;
  fallback: boolean;
};

const require = createRequire(import.meta.url);
const schemaSource = require('../../../schemas/pif-v1.schema.json') as JsonObject;

const normalizeRef = (ref: string): string =>
  ref.startsWith('#/$defs/') ? ref.replace('#/$defs/', '#/definitions/') : ref;

const downgradeSchemaDraft = (node: unknown): unknown => {
  if (Array.isArray(node)) {
    return node.map(downgradeSchemaDraft);
  }

  if (node && typeof node === 'object') {
    return Object.entries(node as JsonObject).reduce<JsonObject>((acc, [key, value]) => {
      const normalizedKey = key === '$defs' ? 'definitions' : key;
      let nextValue = downgradeSchemaDraft(value);

      if (normalizedKey === '$ref' && typeof nextValue === 'string') {
        nextValue = normalizeRef(nextValue);
      }

      acc[normalizedKey] = nextValue;
      return acc;
    }, {});
  }

  if (typeof node === 'string') {
    return normalizeRef(node);
  }

  return node;
};

const compileValidator = (): CompiledValidator => {
  try {
    const Ajv2020 = require('ajv/dist/2020').default as typeof Ajv;
    const ajv2020 = new Ajv2020({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
    });

    return {
      validate: ajv2020.compile(schemaSource as object) as ValidateFunction,
      fallback: false,
    };
  } catch {
    const fallbackSchema = downgradeSchemaDraft(schemaSource) as JsonObject;
    fallbackSchema.$schema = 'http://json-schema.org/draft-07/schema#';

    const ajvLegacy = new Ajv({
      allErrors: true,
      jsonPointers: true,
      schemaId: 'auto',
    });

    return {
      validate: ajvLegacy.compile(fallbackSchema as object) as ValidateFunction,
      fallback: true,
    };
  }
};

const { validate: compiledValidator } = compileValidator();

const toInstancePath = (error: ErrorObject): string => {
  const candidate = (error as any).instancePath as string | undefined;
  if (candidate) {
    return candidate;
  }

  const dataPath = (error as any).dataPath as string | undefined;
  if (!dataPath) {
    return '';
  }

  const pointer = dataPath
    .replace(/\[(\d+)\]/g, '/$1')
    .replace(/\['([^']+)'\]/g, '/$1')
    .replace(/\["([^"]+)"\]/g, '/$1')
    .replace(/^\./, '/')
    .replace(/\./g, '/');

  return pointer.startsWith('/') ? pointer : `/${pointer}`;
};

const normalizeErrors = (errors: Array<ErrorObject> | null | undefined): PIFValidationError[] =>
  (errors ?? []).map((error) => ({
    ...error,
    instancePath: toInstancePath(error),
  }));

export const validatePIF = (document: unknown): PIFValidationResult => {
  if (compiledValidator(document)) {
    return {
      success: true,
      data: document as PIFDocument,
      errors: [] as [],
    };
  }

  return {
    success: false,
    errors: normalizeErrors(compiledValidator.errors),
  };
};
