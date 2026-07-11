-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Wall" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "aspectRatio" TEXT NOT NULL DEFAULT '1:1',
    "bgColor" TEXT,
    "headerLogo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Composite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "wallId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "templateVariant" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "permissionGranted" BOOLEAN NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" DATETIME,
    CONSTRAINT "Composite_wallId_fkey" FOREIGN KEY ("wallId") REFERENCES "Wall" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wall_slug_key" ON "Wall"("slug");

-- CreateIndex
CREATE INDEX "Composite_wallId_status_idx" ON "Composite"("wallId", "status");

-- CreateIndex
CREATE INDEX "Composite_wallId_createdAt_idx" ON "Composite"("wallId", "createdAt");
