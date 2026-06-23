-- Manual helper untuk update kolom shipments.alasan (jsonb) dari teks biasa.
-- Tidak mengubah struktur database. Tidak menambah tabel/kolom/function/trigger.
--
-- Format alasan_text:
--   Toko Tutup
--   Toko Tutup; Tidak Cukup Waktu
--   Lainnya: Jalan ditutup
--   Toko Tutup; Tidak Cukup Waktu; Lainnya: Jalan ditutup
--
-- Ganti shipment_id dan alasan_text pada CTE input_data.

WITH input_data AS (
  SELECT
    123::bigint AS shipment_id,
    'Toko Tutup; Tidak Cukup Waktu; Lainnya: Jalan ditutup'::text AS alasan_text
),
parts AS (
  SELECT
    input_data.shipment_id,
    row_number() OVER () AS urutan,
    btrim(part) AS part
  FROM input_data
  CROSS JOIN regexp_split_to_table(input_data.alasan_text, E'[;\\n]+') AS part
  WHERE btrim(part) <> ''
),
normalized AS (
  SELECT
    shipment_id,
    urutan,
    CASE
      WHEN lower(btrim(split_part(part, ':', 1))) = lower('Toko Tutup') THEN 'Toko Tutup'
      WHEN lower(btrim(split_part(part, ':', 1))) = lower('Salah/Dobel Order') THEN 'Salah/Dobel Order'
      WHEN lower(btrim(split_part(part, ':', 1))) = lower('Tidak Cukup Waktu') THEN 'Tidak Cukup Waktu'
      WHEN lower(btrim(split_part(part, ':', 1))) = lower('Ditolak') THEN 'Ditolak'
      WHEN lower(btrim(split_part(part, ':', 1))) = lower('Lainnya') THEN 'Lainnya'
      ELSE 'Lainnya'
    END AS reason,
    CASE
      WHEN position(':' IN part) > 0 THEN NULLIF(btrim(substr(part, position(':' IN part) + 1)), '')
      WHEN lower(part) NOT IN (
        lower('Toko Tutup'),
        lower('Salah/Dobel Order'),
        lower('Tidak Cukup Waktu'),
        lower('Ditolak'),
        lower('Lainnya')
      ) THEN part
      ELSE NULL
    END AS note
  FROM parts
),
json_result AS (
  SELECT
    shipment_id,
    jsonb_agg(
      CASE
        WHEN note IS NOT NULL THEN jsonb_build_object('reason', reason, 'note', note)
        ELSE jsonb_build_object('reason', reason)
      END
      ORDER BY urutan
    ) AS alasan_json
  FROM normalized
  GROUP BY shipment_id
)
UPDATE public.shipments s
SET
  alasan = json_result.alasan_json,
  updated_at = now()
FROM json_result
WHERE s.shipment_id = json_result.shipment_id;

-- Kosongkan alasan:
-- UPDATE public.shipments
-- SET alasan = NULL, updated_at = now()
-- WHERE shipment_id = 123;

-- Cek alasan sebagai teks biasa:
-- SELECT
--   shipment_id,
--   alasan,
--   (
--     SELECT string_agg(
--       CASE
--         WHEN NULLIF(btrim(item.value ->> 'note'), '') IS NOT NULL
--           THEN (item.value ->> 'reason') || ': ' || btrim(item.value ->> 'note')
--         ELSE item.value ->> 'reason'
--       END,
--       '; '
--     )
--     FROM jsonb_array_elements(COALESCE(alasan, '[]'::jsonb)) AS item(value)
--   ) AS alasan_text
-- FROM public.shipments
-- WHERE shipment_id = 123;
