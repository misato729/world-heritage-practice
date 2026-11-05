-- CreateTable
CREATE TABLE "major_categories" (
    "code" VARCHAR(50) NOT NULL,
    "label" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "major_categories_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "index_major_categories_for_display" ON "major_categories"("display_order", "code");


-- Retain basic master-data invariants at the database boundary.
ALTER TABLE "major_categories"
    ADD CONSTRAINT "major_categories_code_valid" CHECK (code ~ '^[a-z][a-z0-9_]{0,49}$'),
    ADD CONSTRAINT "major_categories_label_present" CHECK (char_length(btrim(label)) > 0),
    ADD CONSTRAINT "major_categories_display_order_positive" CHECK (display_order >= 1);
