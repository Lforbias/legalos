import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida.");
  // Prisma serializa datas em UTC. A sessão PostgreSQL usa o mesmo fuso para os defaults e as filas.
  const adapter = new PrismaPg({ connectionString, options: "-c timezone=UTC" });
  return new PrismaClient({ adapter, log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Cliente único (singleton em dev para sobreviver ao hot reload). */
export const db: PrismaClient = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
