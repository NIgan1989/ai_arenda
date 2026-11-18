-- «Уборка на дом», этап 2 (2026-11-18): исполнитель отмечает «Выезжаю» и «Я на месте», заказчик видит это на карте.
-- Для уборки после гостей поля пустые: там приезд отмечается кнопкой «Гостя нет, жильё свободно».
ALTER TABLE cleaning_jobs ADD COLUMN on_way_at integer;
ALTER TABLE cleaning_jobs ADD COLUMN arrived_at integer;
