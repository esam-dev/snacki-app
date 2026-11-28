-- Borrado lógico de promos y recompensas que ya tienen historial (QR/canjes).
ALTER TABLE "products" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "rewards" ADD COLUMN "deleted_at" TIMESTAMP(3);
