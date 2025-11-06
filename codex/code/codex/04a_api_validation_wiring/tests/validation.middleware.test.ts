import { describe, expect, it } from 'vitest';

import { createResponseValidationHook } from '../../../../../apps/api/src/lib/openapi/validator';

describe('OpenAPI response validation middleware', () => {
  it('returns a 500 problem when handler response violates the contract', async () => {
    const hook = await createResponseValidationHook();
    const request = {
      method: 'GET',
      routeOptions: { url: '/playlists/:id' },
    };
    const reply = {
      statusCode: 200,
      getHeader: () => 'application/json',
    };

    const promise = hook(request, reply, {
      id: 123,
    });

    await expect(promise).rejects.toMatchObject({
      code: 'contract_validation_failed',
      statusCode: 500,
    });
    await promise.catch((error: any) => {
      expect(error.details?.errors?.[0]?.message ?? '').toContain('must have required property');
    });
  });

  it('allows compliant responses to pass through untouched', async () => {
    const hook = await createResponseValidationHook();
    const request = {
      method: 'GET',
      routeOptions: { url: '/playlists/:id' },
    };
    const reply = {
      statusCode: 200,
      getHeader: () => 'application/json',
    };

    const payload = {
      id: 321,
      name: 'OK playlist',
    };

    await expect(hook(request, reply, payload)).resolves.toEqual(payload);
  });
});
