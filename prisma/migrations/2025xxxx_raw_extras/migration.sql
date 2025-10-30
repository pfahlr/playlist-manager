-- 1) Partial unique index: only one non-null ISRC per recording
CREATE UNIQUE INDEX IF NOT EXISTS uq_recording_isrc_not_null
ON "recording" ("isrc") WHERE "isrc" IS NOT NULL;

-- 2) Touch-updated_at trigger (generic)
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Attach to tables that have updated_at
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'playlist','recording','album','artist',
    'playlist_item','artist_bio','artist_link','artist_relation','job'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I;', tbl, tbl);
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at();', tbl, tbl);
  END LOOP;
END $$;

-- 3) Effective view for playlist items (normalized -> snapshot fallback)
CREATE OR REPLACE VIEW v_playlist_item_effective AS
SELECT
  pi.id,
  pi.playlist_id,
  pi.position,
  COALESCE(r.title, pi.snapshot_title) AS title,
  COALESCE(na.norm_artists, pi.snapshot_artists) AS artists,
  COALESCE(al.title, pi.snapshot_album) AS album,
  COALESCE(r.duration_ms, pi.duration_ms) AS duration_ms,
  pi.isrc,
  pi.mb_recording_id,
  pi.mb_release_id,
  pi.provider_track_id,
  pi.recording_id
FROM playlist_item pi
LEFT JOIN recording r ON r.id = pi.recording_id
LEFT JOIN album al ON al.id = r.album_id
LEFT JOIN LATERAL (
  SELECT string_agg(a.name, '; ' ORDER BY ra.ordinal NULLS LAST) AS norm_artists
  FROM recording_artist ra
  JOIN artist a ON a.id = ra.artist_id
  WHERE ra.recording_id = r.id
) na ON TRUE;

-- (Optional) Helper indexes for view join performance (if not already present)
CREATE INDEX IF NOT EXISTS idx_recording_album_id ON recording(album_id);
CREATE INDEX IF NOT EXISTS idx_recording_artist_rec ON recording_artist(recording_id);
CREATE INDEX IF NOT EXISTS idx_recording_artist_ord ON recording_artist(recording_id, ordinal);
