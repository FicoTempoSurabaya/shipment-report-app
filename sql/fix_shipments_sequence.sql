-- Fix sequence shipment_id setelah import data real/manual.
-- Jalankan di Neon SQL Editor atau psql jika POST /api/freelance/shipments selalu 409
-- walaupun area, nama freelance, tanggal, dan shipment_code sudah berbeda.

SELECT setval(
  pg_get_serial_sequence('public.shipments', 'shipment_id'),
  COALESCE((SELECT MAX(shipment_id) FROM public.shipments), 0) + 1,
  false
);

-- Opsional: cek hasil sinkronisasi sequence.
SELECT
  pg_get_serial_sequence('public.shipments', 'shipment_id') AS sequence_name,
  COALESCE((SELECT MAX(shipment_id) FROM public.shipments), 0) AS max_shipment_id,
  nextval(pg_get_serial_sequence('public.shipments', 'shipment_id')) AS next_generated_shipment_id;

-- Setelah menjalankan SELECT nextval di atas, sinkronkan lagi agar angka yang sudah dipakai untuk cek
-- tidak membuat loncatan yang tidak perlu.
SELECT setval(
  pg_get_serial_sequence('public.shipments', 'shipment_id'),
  COALESCE((SELECT MAX(shipment_id) FROM public.shipments), 0) + 1,
  false
);
