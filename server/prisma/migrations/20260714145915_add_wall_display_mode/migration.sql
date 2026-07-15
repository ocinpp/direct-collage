-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Wall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "aspectRatio" TEXT NOT NULL DEFAULT '1:1',
    "bgColor" TEXT,
    "headerLogo" TEXT,
    "scrollSpeed" INTEGER,
    "displayMode" TEXT NOT NULL DEFAULT 'scrolling-grid',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Wall" ("aspectRatio", "bgColor", "createdAt", "headerLogo", "id", "name", "scrollSpeed", "slug", "status", "title", "updatedAt") SELECT "aspectRatio", "bgColor", "createdAt", "headerLogo", "id", "name", "scrollSpeed", "slug", "status", "title", "updatedAt" FROM "Wall";
DROP TABLE "Wall";
ALTER TABLE "new_Wall" RENAME TO "Wall";
CREATE UNIQUE INDEX "Wall_slug_key" ON "Wall"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
