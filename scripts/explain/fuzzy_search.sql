\echo 'EXPLAIN fuzzy artist/title lookup'

EXPLAIN (ANALYZE, BUFFERS)
SELECT a.id, a.name
FROM artist a
WHERE a.name % 'Aphex Twin'
ORDER BY similarity(a.name, 'Aphex Twin') DESC
LIMIT 5;

EXPLAIN (ANALYZE, BUFFERS)
SELECT r.id, r.title
FROM recording r
WHERE r.title % 'Roygbiv'
ORDER BY similarity(r.title, 'Roygbiv') DESC
LIMIT 5;
