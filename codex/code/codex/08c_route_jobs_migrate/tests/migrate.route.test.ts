import { expect, test, vi } from 'vitest';
import request from 'supertest';
import { makeServer } from '../../testServer';
import * as Enq from '../../../../../apps/api/src/lib/jobs/enqueue';

const DUMMY_PAYLOAD = {
  source_provider: 'spotify',
  source_playlist_id: 1,
  dest_provider: 'tidal',
};

test('202 on migrate enqueue', async () => {
  const app = await makeServer();
  vi.spyOn(Enq, 'enqueue').mockResolvedValue({ id: 99 });
  const res = await request(app).post('/api/v1/jobs/migrate').send(DUMMY_PAYLOAD);
  expect(res.status).toBe(202);
  expect(res.body.job_id).toBe(99);
});

test('invalid provider rejected', async () => {
  const app = await makeServer();
  const res = await request(app)
    .post('/api/v1/jobs/migrate')
    .send({ ...DUMMY_PAYLOAD, dest_provider: 'unknown' });
  expect(res.status).toBe(400);
});
