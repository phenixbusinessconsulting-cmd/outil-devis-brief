import { Router } from 'express';
import { prisma, getSettings, audit } from '../db.js';
import { badRequest, notFound, idParam, HttpError } from '../middleware/errors.js';
import { computeQuote } from '../services/pricing.js';
import { buildSitemap } from '../services/seo.js';
import { loadClient } from '../services/clients.js';
import { PAYMENT_CHOICES } from '../services/constants.js';

export const router = Router();

const quoteInclude = {
  lines: { orderBy: { position: 'asc' } },
  client: true,
  createdBy: { select: { displayName: true } },
};

const withTotals = (quote) => ({ ...quote, computed: computeQuote(quote) });

/** Instantané des paramètres : un devis ne bouge plus si les paramètres changent. */
function settingsSnapshot(s) {
  return {
    validityDays: s.quoteValidityDays,
    vatRegime: s.vatRegime,
    cashDiscountPct: s.cashDiscountPct,
    depositPct: s.depositPct,
    monthlySurcharge12Pct: s.monthlySurcharge12Pct,
    monthlySurcharge24Pct: s.monthlySurcharge24Pct,
    monthlySurcharge36Pct: s.monthlySurcharge36Pct,
    exemptionMention: s.exemptionMention,
    legalMentions: s.legalMentions,
  };
}

async function loadQuote(id) {
  const quote = await prisma.quote.findUnique({ where: { id }, include: quoteInclude });
  if (!quote) throw notFound('Devis');
  return quote;
}

router.get('/', async (req, res) => {
  const where = req.query.clientId ? { clientId: idParam(req.query.clientId) } : undefined;
  const quotes = await prisma.quote.findMany({ where, include: quoteInclude, orderBy: { createdAt: 'desc' } });
  res.json(
    quotes.map((q) => {
      const c = computeQuote(q);
      const { lines, ...rest } = q;
      return { ...rest, lineCount: lines.length, oneOffDue: c.oneOff.due, recurringDue: c.recurring.due };
    }),
  );
});

/**
 * Génère un devis depuis les modules cochés de la fiche : chaque module
 * prend son tarif dans le catalogue. Les lignes « par page » reçoivent le
 * nombre de pages de prestations et de villes de l'arborescence proposée :
 * accueil, à propos, tarifs et contact relèvent du forfait de base.
 */
router.post('/from-client/:clientId', async (req, res) => {
  const client = await loadClient(idParam(req.params.clientId));
  if (!client) throw notFound('Fiche');
  const settings = await getSettings();
  const pageCount = Math.max(
    1,
    buildSitemap(client, client.offerings).filter((p) => p.type === 'Prestation' || p.type === 'Ville').length,
  );

  const lines = client.modules
    .filter((m) => m.catalogItem.active)
    .sort((a, b) => (a.catalogItem.category === 'SITE' ? -1 : 0) - (b.catalogItem.category === 'SITE' ? -1 : 0))
    .map((m, i) => ({
      catalogItemId: m.catalogItemId,
      label: m.catalogItem.label,
      description: [m.catalogItem.description, m.precision].filter(Boolean).join(' — ').slice(0, 1000),
      unit: m.catalogItem.unit,
      unitPriceHT: m.catalogItem.basePriceHT,
      quantity: m.catalogItem.unit === 'PAGE' ? pageCount : 1,
      recurring: m.catalogItem.unit === 'MOIS',
      isOption: m.isOption,
      position: i,
    }));

  const quote = await prisma.quote.create({
    data: {
      ...settingsSnapshot(settings),
      clientId: client.id,
      createdById: req.user.id,
      clientVatNumber: client.tvaIntracom,
      lines: { create: lines },
    },
    include: quoteInclude,
  });
  await prisma.client.update({ where: { id: client.id }, data: { lastActivityAt: new Date() } });
  res.status(201).json(withTotals(quote));
});

router.get('/:id', async (req, res) => {
  res.json(withTotals(await loadQuote(idParam(req.params.id))));
});

function lineRows(lines) {
  if (!Array.isArray(lines)) throw badRequest('Lignes manquantes');
  return lines.slice(0, 200).map((l, i) => {
    const unit = ['FORFAIT', 'PAGE', 'MOIS', 'HEURE'].includes(l.unit) ? l.unit : 'FORFAIT';
    const discountType = ['AUCUNE', 'POURCENT', 'MONTANT'].includes(l.discountType) ? l.discountType : 'AUCUNE';
    const label = String(l.label ?? '').trim().slice(0, 300);
    if (!label) throw badRequest(`Ligne ${i + 1} : désignation manquante`);
    return {
      catalogItemId: Number.isInteger(l.catalogItemId) ? l.catalogItemId : null,
      label,
      description: String(l.description ?? '').slice(0, 1000),
      unit,
      unitPriceHT: Math.max(0, Math.round(Number(l.unitPriceHT) || 0)),
      quantity: Math.max(0, Number(l.quantity) || 0),
      discountType,
      discountValue: Math.max(0, Number(l.discountValue) || 0),
      recurring: unit === 'MOIS',
      isOption: Boolean(l.isOption),
      position: i,
    };
  });
}

const pct = (v) => Math.min(Math.max(Number(v) || 0, 0), 100);

router.put('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const current = await loadQuote(id);
  if (current.status !== 'BROUILLON') throw new HttpError(409, 'Un devis émis ne se modifie plus : dupliquez-le');
  const b = req.body || {};
  const lines = lineRows(b.lines);
  const data = {
    vatRegime: ['TVA_20', 'AUTOLIQUIDATION', 'EXONERATION'].includes(b.vatRegime) ? b.vatRegime : current.vatRegime,
    clientVatNumber: String(b.clientVatNumber ?? '').replace(/\s/g, '').toUpperCase().slice(0, 30),
    validityDays: Math.min(Math.max(Math.round(Number(b.validityDays) || 30), 1), 365),
    cashDiscountPct: pct(b.cashDiscountPct),
    depositPct: pct(b.depositPct),
    monthlySurcharge12Pct: pct(b.monthlySurcharge12Pct),
    monthlySurcharge24Pct: pct(b.monthlySurcharge24Pct),
    monthlySurcharge36Pct: pct(b.monthlySurcharge36Pct),
    monthlyDownPayment: Math.max(0, Math.round(Number(b.monthlyDownPayment) || 0)),
    selectedPayment: PAYMENT_CHOICES.some((p) => p.code === b.selectedPayment) ? b.selectedPayment : '',
    notes: String(b.notes ?? '').slice(0, 5000),
    legalMentions: String(b.legalMentions ?? current.legalMentions).slice(0, 10000),
  };
  const quote = await prisma.$transaction(async (tx) => {
    await tx.quoteLine.deleteMany({ where: { quoteId: id } });
    return tx.quote.update({ where: { id }, data: { ...data, lines: { create: lines } }, include: quoteInclude });
  });
  res.json(withTotals(quote));
});

// Émission : numéro définitif, sans trou, attribué dans une transaction.
router.post('/:id/emettre', async (req, res) => {
  const id = idParam(req.params.id);
  const current = await loadQuote(id);
  if (current.status !== 'BROUILLON') throw new HttpError(409, 'Devis déjà émis');
  if (!current.lines.length) throw badRequest('Le devis ne contient aucune ligne');
  const issuedAt = new Date();
  const year = issuedAt.getFullYear();
  const quote = await prisma.$transaction(async (tx) => {
    const seq = await tx.quoteSequence.upsert({
      where: { year },
      update: { lastNumber: { increment: 1 } },
      create: { year, lastNumber: 1 },
    });
    const number = `D-${year}-${String(seq.lastNumber).padStart(4, '0')}`;
    return tx.quote.update({ where: { id }, data: { number, issuedAt, status: 'EMIS' }, include: quoteInclude });
  });
  await audit(req.user.id, 'QUOTE_ISSUED', 'Quote', id);
  res.json(withTotals(quote));
});

router.post('/:id/statut', async (req, res) => {
  const id = idParam(req.params.id);
  const status = req.body?.status;
  if (!['SIGNE', 'REFUSE', 'EMIS'].includes(status)) throw badRequest('Statut invalide');
  const current = await loadQuote(id);
  if (current.status === 'BROUILLON') throw badRequest('Émettez d’abord le devis');
  const quote = await prisma.quote.update({ where: { id }, data: { status }, include: quoteInclude });
  res.json(withTotals(quote));
});

router.post('/:id/dupliquer', async (req, res) => {
  const src = await loadQuote(idParam(req.params.id));
  const { id, number, issuedAt, status, createdAt, updatedAt, client, createdBy, lines, createdById, ...fields } = src;
  const quote = await prisma.quote.create({
    data: {
      ...fields,
      createdById: req.user.id,
      lines: { create: lines.map(({ id: _i, quoteId: _q, ...l }) => l) },
    },
    include: quoteInclude,
  });
  res.status(201).json(withTotals(quote));
});

router.delete('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const current = await loadQuote(id);
  if (current.status !== 'BROUILLON') {
    throw new HttpError(409, 'Un devis émis est conservé ; seul un brouillon peut être supprimé');
  }
  await prisma.quote.delete({ where: { id } });
  res.json({ ok: true });
});
