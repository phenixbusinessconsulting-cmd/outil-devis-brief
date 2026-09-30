import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { config } from './config.js';

export const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: config.databaseUrl }),
});

/** Paramètres (ligne unique id = 1), créés au premier accès. */
export async function getSettings() {
  return prisma.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function audit(userId, action, entity = null, entityId = null) {
  await prisma.auditLog.create({ data: { userId, action, entity, entityId } });
}
