-- «Уборка на дом», этап 3 (2026-11-18): отмена с бесплатным сроком и оценка исполнителя.
-- cancel_fee: сколько положено исполнителю, если заказчик отменил позже бесплатного срока (0 — отмена бесплатная).
-- rating: оценка заказчика после приёмки, от 1 до 5; rating_note видит только исполнитель.
ALTER TABLE cleaning_jobs ADD COLUMN cancel_fee integer NOT NULL DEFAULT 0;
ALTER TABLE cleaning_jobs ADD COLUMN cancelled_at integer;
ALTER TABLE cleaning_jobs ADD COLUMN rating integer;
ALTER TABLE cleaning_jobs ADD COLUMN rating_note text NOT NULL DEFAULT '';
ALTER TABLE cleaning_jobs ADD COLUMN rated_at integer;
