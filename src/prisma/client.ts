// src/prisma/client.ts
import { PrismaClient } from "@prisma/client";

// Ensure the Prisma Client is a singleton to prevent multiple instances
// during hot reloads or multiple server imports.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["query", "warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
