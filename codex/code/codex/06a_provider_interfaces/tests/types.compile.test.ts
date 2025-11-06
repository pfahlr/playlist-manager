import { expect, test } from 'vitest';

import type { Exporter, Importer } from '../../../../../packages/contracts/src/providers.ts';
import Spotify from '../../../../../packages/providers/spotify/src/index.ts';

test('spotify implements importer/exporter contract', () => {
  const provider: Importer & Exporter = new Spotify();
  expect(provider).toBeInstanceOf(Spotify);
});
