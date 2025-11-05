import { z } from 'zod';

const Row = z.object({
  title: z.string(),
  primary_artist: z.string(),
  album: z.string().optional().nullable(),
  duration_ms: z.coerce.number().optional().nullable(),
  mbid: z.string().optional().nullable(),
  isrc: z.string().optional().nullable()
});
type Row = z.infer<typeof Row>;

export function parseCsvToPif(csv: string) {
  // super-lean CSV parser (assumes header exists, commas not quoted) -> swap to a proper parser later
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(',').map((h) => h.trim());
  const rows: Row[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const vals = line.split(',').map((v) => v.trim());
    const rec: any = {};
    headers.forEach((h, i) => (rec[h] = vals[i]));
    rows.push(Row.parse(rec));
  }
  return {
    version: 'pif-v1',
    tracks: rows.map((r) => ({
      title: r.title,
      primary_artist: r.primary_artist,
      album: r.album ?? null,
      duration_ms: r.duration_ms ?? null,
      mbid: r.mbid ?? null,
      isrc: r.isrc ?? null
    }))
  };
}
