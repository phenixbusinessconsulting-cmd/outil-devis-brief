import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma, getSettings, audit } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { badRequest, notFound, idParam } from '../middleware/errors.js';
import { CATEGORIES, UNITS, VAT_REGIMES } from '../services/constants.js';
import { expiredClients } from '../services/clients.js';

export const router = Router();
router.use(requireRole('ADMIN'));

const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const pct = (v) => Math.min(Math.max(Number(v) || 0, 0), 100);

/* ---------- Catalogue ---------- */

function catalogFields(b) {
  const code = str(b.code, 80).toLowerCase().replace(/[^a-z0-9.-]+/g, '-');
  const label = str(b.label, 200);
  if (!code) throw badRequest('Code manquant');
  if (!label) throw badRequest('Libellé manquant');
  if (!CATEGORIES.some((c) => c.code === b.category)) throw badRequest(`Catégorie inconnue pour ${code}`);
  if (!UNITS.some((u) => u.code === b.unit)) throw badRequest(`Unité inconnue pour ${code}`);
  return {
    code,
    label,
    description: str(b.description, 2000),
    basePriceHT: Math.max(0, Math.round(Number(b.basePriceHT) || 0)),
    unit: b.unit,
    category: b.category,
    active: b.active !== false,
    position: Math.round(Number(b.position) || 0),
  };
}

router.post('/catalog', async (req, res) => {
  res.status(201).json(await prisma.catalogItem.create({ data: catalogFields(req.body || {}) }));
});

router.put('/catalog/:id', async (req, res) => {
  res.json(await prisma.catalogItem.update({ where: { id: idParam(req.params.id) }, data: catalogFields(req.body || {}) }));
});

router.delete('/catalog/:id', async (req, res) => {
  const id = idParam(req.params.id);
  await prisma.catalogItem.delete({ where: { id } });
  await audit(req.user.id, 'CATALOG_ITEM_DELETED', 'CatalogItem', id);
  res.json({ ok: true });
});

router.get('/catalog/export', async (req, res) => {
  const items = await prisma.catalogItem.findMany({ orderBy: [{ category: 'asc' }, { position: 'asc' }] });
  const data = items.map(({ id, ...rest }) => rest);
  res.set('Content-Disposition', `attachment; filename="catalogue-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ format: 'outil-devis/catalogue', version: 1, exportedAt: new Date(), items: data });
});

// Import : fusion par code (création ou mise à jour), tout ou rien.
router.post('/catalog/import', async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : req.body?.items;
  if (!Array.isArray(items) || !items.length) throw badRequest('Fichier JSON invalide : liste « items » attendue');
  const rows = items.map(catalogFields);
  let created = 0;
  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const exists = await tx.catalogItem.findUnique({ where: { code: row.code }, select: { id: true } });
      await tx.catalogItem.upsert({ where: { code: row.code }, update: row, create: row });
      exists ? updated++ : created++;
    }
  });
  await audit(req.user.id, 'CATALOG_IMPORTED');
  res.json({ created, updated });
});

/* ---------- Paramètres ---------- */

router.get('/settings', async (req, res) => res.json(await getSettings()));

router.put('/settings', async (req, res) => {
  const b = req.body || {};
  if (!VAT_REGIMES.some((v) => v.code === b.vatRegime)) throw badRequest('Régime de TVA inconnu');
  const data = {
    vatRegime: b.vatRegime,
    exemptionMention: str(b.exemptionMention, 500),
    cashDiscountPct: pct(b.cashDiscountPct),
    depositPct: pct(b.depositPct),
    monthlySurcharge12Pct: pct(b.monthlySurcharge12Pct),
    monthlySurcharge24Pct: pct(b.monthlySurcharge24Pct),
    monthlySurcharge36Pct: pct(b.monthlySurcharge36Pct),
    quoteValidityDays: Math.min(Math.max(Math.round(Number(b.quoteValidityDays) || 30), 1), 365),
    providerName: str(b.providerName, 200),
    providerAddress: str(b.providerAddress, 500),
    providerSiret: str(b.providerSiret, 20),
    providerVatNumber: str(b.providerVatNumber, 30),
    providerEmail: str(b.providerEmail, 200),
    providerPhone: str(b.providerPhone, 30),
    legalMentions: str(b.legalMentions, 10000),
    clientRetentionMonths: Math.min(Math.max(Math.round(Number(b.clientRetentionMonths) || 36), 1), 240),
  };
  await getSettings();
  res.json(await prisma.settings.update({ where: { id: 1 }, data }));
});

/* ---------- RGPD ----------
 * Pas de purge automatique : les fiches échues sont listées, la
 * suppression reste une décision manuelle, fiche par fiche. */

router.get('/rgpd', async (req, res) => {
  const settings = await getSettings();
  res.json({
    retentionMonths: settings.clientRetentionMonths,
    expired: await expiredClients(settings.clientRetentionMonths),
  });
});

/* ---------- Utilisateurs ---------- */

const publicUser = { id: true, username: true, displayName: true, role: true, active: true, lastLoginAt: true, createdAt: true };

router.get('/users', async (req, res) => {
  res.json(await prisma.user.findMany({ select: publicUser, orderBy: { username: 'asc' } }));
});

function checkPassword(p) {
  if (String(p || '').length < 10) throw badRequest('Mot de passe : 10 caractères minimum');
}

router.post('/users', async (req, res) => {
  const b = req.body || {};
  const username = str(b.username, 60).toLowerCase();
  if (!/^[a-z0-9._@+-]{3,}$/.test(username)) throw badRequest('Identifiant : 3 caractères minimum, lettres sans accent, chiffres, . _ - @ +');
  checkPassword(b.password);
  const user = await prisma.user.create({
    data: {
      username,
      displayName: str(b.displayName, 100) || username,
      role: b.role === 'ADMIN' ? 'ADMIN' : 'COMMERCIAL',
      passwordHash: await bcrypt.hash(String(b.password), 12),
    },
    select: publicUser,
  });
  await audit(req.user.id, 'USER_CREATED', 'User', user.id);
  res.status(201).json(user);
});

router.put('/users/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const b = req.body || {};
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw notFound('Utilisateur');
  const data = {
    displayName: str(b.displayName, 100) || target.displayName,
    role: b.role === 'ADMIN' ? 'ADMIN' : 'COMMERCIAL',
    active: b.active !== false,
  };
  if (id === req.user.id && (data.role !== 'ADMIN' || !data.active)) {
    throw badRequest('Vous ne pouvez pas retirer vos propres droits d’administrateur');
  }
  if (b.password) {
    checkPassword(b.password);
    data.passwordHash = await bcrypt.hash(String(b.password), 12);
  }
  const user = await prisma.user.update({ where: { id }, data, select: publicUser });
  if (!data.active || b.password) {
    const sessions = await prisma.session.findMany({ select: { sid: true, data: true } });
    const sids = sessions.filter((s) => JSON.parse(s.data).userId === id).map((s) => s.sid);
    await prisma.session.deleteMany({ where: { sid: { in: sids } } });
  }
  await audit(req.user.id, 'USER_UPDATED', 'User', id);
  res.json(user);
});
