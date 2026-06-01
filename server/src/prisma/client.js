import { PrismaClient } from "@prisma/client";
import { mockPrisma } from "./mockClient.js";

const globalForPrisma = globalThis;

export const prisma =
  process.env.DEMO_MODE === "true"
    ? mockPrisma
    : globalForPrisma.prisma ||
      new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
      });

if (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE !== "true") {
  globalForPrisma.prisma = prisma;
}
