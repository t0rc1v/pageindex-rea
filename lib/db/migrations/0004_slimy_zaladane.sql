-- Existing rows were registered before the display/upstream split, so their
-- current name is the upstream name. Add the column nullable, backfill, then
-- enforce NOT NULL — a single ADD COLUMN ... NOT NULL has no value for rows that
-- already exist.
ALTER TABLE "documents" ADD COLUMN "upstream_name" text;
--> statement-breakpoint
UPDATE "documents" SET "upstream_name" = "name" WHERE "upstream_name" IS NULL;
--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "upstream_name" SET NOT NULL;
