CREATE TABLE "document_reviews" (
 "id" UUID NOT NULL PRIMARY KEY,
 "organization_id" UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
 "document_id" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
 "version" INTEGER NOT NULL CHECK (version > 0),
 "status" TEXT NOT NULL DEFAULT 'IN_REVIEW' CHECK (status IN ('IN_REVIEW','APPROVED','CHANGES_REQUESTED','SUPERSEDED')),
 "requested_by_id" UUID NOT NULL,
 "reviewed_by_id" UUID,
 "note" TEXT,
 "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "reviewed_at" TIMESTAMPTZ(3)
);
CREATE INDEX "document_reviews_organization_id_status_idx" ON "document_reviews"("organization_id", "status");
CREATE INDEX "document_reviews_document_id_created_at_idx" ON "document_reviews"("document_id", "created_at");
CREATE UNIQUE INDEX "document_reviews_pending_unique" ON "document_reviews"("document_id") WHERE "status" = 'IN_REVIEW';
