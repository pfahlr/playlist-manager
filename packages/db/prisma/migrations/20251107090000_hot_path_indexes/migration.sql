-- Enable trigram search capability for fuzzy lookups
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Playlists queried by user most frequently; include updated_at for recency sorts
CREATE INDEX IF NOT EXISTS playlist_user_scope_idx
ON "playlist" ("user_id", "updated_at" DESC);

-- Playlist items joined to recordings for normalization pipelines
CREATE INDEX IF NOT EXISTS playlist_item_recording_id_idx
ON "playlist_item" ("recording_id");

-- Follow lists queried by artist (fan counts, discovery)
CREATE INDEX IF NOT EXISTS artist_follow_artist_id_idx
ON "artist_follow" ("artist_id");

-- Fuzzy lookup support for artist and track search
CREATE INDEX IF NOT EXISTS artist_name_trgm_idx
ON "artist" USING gin ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS recording_title_trgm_idx
ON "recording" USING gin ("title" gin_trgm_ops);
