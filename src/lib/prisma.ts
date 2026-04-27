import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __genlinkPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__genlinkPrisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalThis.__genlinkPrisma = prisma;
}
