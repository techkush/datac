-- CreateTable
CREATE TABLE "boards" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled board',
    "parent" TEXT NOT NULL DEFAULT '',
    "viewport" JSONB,
    "cards" JSONB NOT NULL DEFAULT '[]',
    "arrows" JSONB NOT NULL DEFAULT '[]',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_revisions" (
    "id" TEXT NOT NULL,
    "boardRef" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cards" JSONB NOT NULL,
    "arrows" JSONB NOT NULL,
    "cause" TEXT NOT NULL DEFAULT 'save',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "boards_workspaceId_updatedAt_idx" ON "boards"("workspaceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "boards_workspaceId_boardId_key" ON "boards"("workspaceId", "boardId");

-- CreateIndex
CREATE INDEX "board_revisions_boardRef_createdAt_idx" ON "board_revisions"("boardRef", "createdAt");

-- AddForeignKey
ALTER TABLE "board_revisions" ADD CONSTRAINT "board_revisions_boardRef_fkey" FOREIGN KEY ("boardRef") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
