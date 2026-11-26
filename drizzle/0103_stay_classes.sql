-- Classes of a place to stay (2026-11-26): Эконом, Стандарт, Комфорт, Премиум (lib/stay-class.ts). The AI suggests the
-- class when the place is added (the renovation on the photos, the space per guest, the amenities), the owner confirms or
-- changes it, a platform administrator may correct it. The guest sees the class on the card and can search by it; the
-- price hint compares a place only with places of its own class. NULL: not set yet, the rules estimate it on reading.
-- stay_class_by: who set it last, 'ai', 'owner' or 'admin'.
ALTER TABLE properties ADD COLUMN stay_class TEXT CHECK(stay_class IS NULL OR stay_class IN ('economy','standard','comfort','premium'));
ALTER TABLE properties ADD COLUMN stay_class_by TEXT CHECK(stay_class_by IS NULL OR stay_class_by IN ('ai','owner','admin'));
