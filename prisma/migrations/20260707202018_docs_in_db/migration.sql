-- CreateTable
CREATE TABLE "docs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "icon" TEXT NOT NULL DEFAULT '',
    "cover" TEXT NOT NULL DEFAULT '',
    "parent" TEXT NOT NULL DEFAULT '',
    "orphaned" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT '',
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "comments" JSONB NOT NULL DEFAULT '{}',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "docs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_revisions" (
    "id" TEXT NOT NULL,
    "docRef" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "comments" JSONB NOT NULL,
    "cause" TEXT NOT NULL DEFAULT 'save',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "docs_workspaceId_updatedAt_idx" ON "docs"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "docs_workspaceId_docId_key" ON "docs"("workspaceId", "docId");

-- CreateIndex
CREATE INDEX "doc_revisions_docRef_createdAt_idx" ON "doc_revisions"("docRef", "createdAt");

-- AddForeignKey
ALTER TABLE "doc_revisions" ADD CONSTRAINT "doc_revisions_docRef_fkey" FOREIGN KEY ("docRef") REFERENCES "docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
