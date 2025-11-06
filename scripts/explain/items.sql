\echo 'EXPLAIN playlist items join to recordings'

EXPLAIN (ANALYZE, BUFFERS)
SELECT pi.id, pi.position, r.title
FROM playlist_item pi
JOIN recording r ON r.id = pi.recording_id
WHERE pi.playlist_id = (
  SELECT id FROM playlist ORDER BY id LIMIT 1
)
ORDER BY pi.position
LIMIT 20;
