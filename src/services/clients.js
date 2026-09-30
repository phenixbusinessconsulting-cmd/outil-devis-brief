import { prisma, audit } from '../db.js';
import { deleteScreenshotFiles } from './images.js';

/** Fiche complète, dans l'ordre de saisie. */
export function loadClient(id) {
  return prisma.client.findUnique({
    where: { id },
    include: {
      offerings: { orderBy: { position: 'asc' } },
      modules: { include: { catalogItem: true }, orderBy: { catalogItem: { position: 'asc' } } },
      references: {
        orderBy: { position: 'asc' },
        include: { screenshots: { orderBy: { position: 'asc' } } },
      },
      createdBy: { select: { displayName: true } },
    },
  });
}

/**
 * Suppression définitive (RGPD) : fiche, prestations, modules, références,
 * devis en base (cascade), puis captures sur le disque.
 */
export async function deleteClientPermanently(id, userId) {
  const shots = await prisma.screenshot.findMany({
    where: { reference: { clientId: id } },
    select: { storedName: true },
  });
  await prisma.client.delete({ where: { id } });
  await deleteScreenshotFiles(shots.map((s) => s.storedName));
  await audit(userId, 'CLIENT_DELETED', 'Client', id);
}

/** Fiches dont la durée de conservation est dépassée. */
export async function expiredClients(retentionMonths) {
  const limit = new Date();
  limit.setMonth(limit.getMonth() - retentionMonths);
  return prisma.client.findMany({
    where: { lastActivityAt: { lt: limit } },
    select: { id: true, raisonSociale: true, nomCommercial: true, lastActivityAt: true },
    orderBy: { lastActivityAt: 'asc' },
  });
}
