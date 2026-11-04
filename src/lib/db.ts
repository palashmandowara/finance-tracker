import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const globalDb = globalThis as unknown as { db?: PrismaClient };
export function getDb() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL in .env before starting the app.");
  return (globalDb.db ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }));
}
