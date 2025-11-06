\echo 'EXPLAIN playlists by user scope'

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name, updated_at
FROM playlist
WHERE user_id = (
  SELECT id FROM app_user ORDER BY id LIMIT 1
)
ORDER BY updated_at DESC
LIMIT 10;
