import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

declare global {
  var __genlinkPrisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl && tursoToken) {
    const adapter = new PrismaLibSQL({
      url: tursoUrl,
      authToken: tursoToken,
    });
    return new PrismaClient({ adapter, log: ["warn", "error"] });
  }

  return new PrismaClient({ log: ["warn", "error"] });
}

export const prisma = globalThis.__genlinkPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__genlinkPrisma = prisma;
}
