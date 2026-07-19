PRAGMA foreign_keys=OFF;

CREATE TABLE "Canvas" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "viewport" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Canvas_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "Canvas" ("id", "projectId", "name", "position", "viewport", "createdAt", "updatedAt")
SELECT 'canvas-' || "id", "id", '画布 1', 0, '{"x":0,"y":0,"zoom":1}', "createdAt", "updatedAt"
FROM "Project";

CREATE TABLE "new_CanvasNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "positionX" REAL NOT NULL,
    "positionY" REAL NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CanvasNode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CanvasNode_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_CanvasNode" ("id", "projectId", "canvasId", "type", "positionX", "positionY", "data", "createdAt", "updatedAt")
SELECT "id", "projectId", 'canvas-' || "projectId", "type", "positionX", "positionY", "data", "createdAt", "updatedAt"
FROM "CanvasNode";

DROP TABLE "CanvasNode";
ALTER TABLE "new_CanvasNode" RENAME TO "CanvasNode";

CREATE TABLE "new_CanvasEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "canvasId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "sourceHandle" TEXT,
    "targetHandle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanvasEdge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CanvasEdge_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "Canvas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_CanvasEdge" ("id", "projectId", "canvasId", "source", "target", "sourceHandle", "targetHandle", "createdAt")
SELECT "id", "projectId", 'canvas-' || "projectId", "source", "target", "sourceHandle", "targetHandle", "createdAt"
FROM "CanvasEdge";

DROP TABLE "CanvasEdge";
ALTER TABLE "new_CanvasEdge" RENAME TO "CanvasEdge";

CREATE INDEX "Canvas_projectId_position_idx" ON "Canvas"("projectId", "position");
CREATE INDEX "CanvasNode_projectId_idx" ON "CanvasNode"("projectId");
CREATE INDEX "CanvasNode_canvasId_idx" ON "CanvasNode"("canvasId");
CREATE INDEX "CanvasEdge_projectId_idx" ON "CanvasEdge"("projectId");
CREATE INDEX "CanvasEdge_canvasId_idx" ON "CanvasEdge"("canvasId");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
