import { Router } from 'express';
import { prisma } from '../db.js';
import { badRequest, notFound, idParam } from '../middleware/errors.js';
import { loadClient, deleteClientPermanently } from '../services/clients.js';
import { deleteScreenshotFiles } from '../services/images.js';
import { TONES, REFERENCE_ELEMENTS, DAYS } from '../services/constants.js';

export const router = Router();

const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
const intOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : null;
};
const floatOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const strList = (v, max = 50) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, 300))
    .filter(Boolean)
    .slice(0, max);
const HEX = /^#[0-9a-f]{6}$/i;

/** Ne garde que les champs attendus, typés : le reste est ignoré. */
function clientFields(b) {
  const communes = (Array.isArray(b.communes) ? b.communes : [])
    .map((c) => ({ nom: str(c?.nom, 120), importante: Boolean(c?.importante) }))
    .filter((c) => c.nom)
    .slice(0, 100);
  const concurrents = (Array.isArray(b.concurrents) ? b.concurrents : [])
    .map((c) => ({ nom: str(c?.nom, 200), url: str(c?.url, 500) }))
    .filter((c) => c.nom || c.url)
    .slice(0, 30);
  const horaires = {};
  DAYS.forEach((d) => {
    const h = b.horaires?.[d];
    horaires[d] = { ferme: Boolean(h?.ferme), plages: str(h?.plages, 200) };
  });
  const reseaux = {};
  ['instagram', 'facebook', 'tiktok', 'linkedin'].forEach((k) => (reseaux[k] = str(b.reseaux?.[k], 500)));
  const tons = strList(b.tons).filter((t) => TONES.some((x) => x.code === t)).slice(0, 3);
  const couleurs = strList(b.couleursImposees).filter((c) => HEX.test(c)).slice(0, 12);
  const note = floatOrNull(b.noteGoogle);

  return {
    raisonSociale: str(b.raisonSociale, 200),
    nomCommercial: str(b.nomCommercial, 200),
    secteur: str(b.secteur, 200),
    anneeCreation: intOrNull(b.anneeCreation),
    siret: str(b.siret, 20).replace(/\s/g, ''),
    formeJuridique: str(b.formeJuridique, 100),
    assurances: str(b.assurances),
    tvaIntracom: str(b.tvaIntracom, 30).replace(/\s/g, '').toUpperCase(),
    adresse: str(b.adresse, 300),
    codePostal: str(b.codePostal, 10),
    ville: str(b.ville, 120),
    communes,
    rayonKm: intOrNull(b.rayonKm),
    motClePrincipal: str(b.motClePrincipal, 200),
    motsClesSecond: strList(b.motsClesSecond),
    longueTraine: strList(b.longueTraine),
    concurrents,
    nbAvisGoogle: intOrNull(b.nbAvisGoogle),
    noteGoogle: note === null ? null : Math.min(Math.max(note, 0), 5),
    temoignages: str(b.temoignages, 5000),
    realisations: str(b.realisations, 5000),
    certifications: str(b.certifications),
    telephone: str(b.telephone, 30),
    email: str(b.email, 200),
    horaires,
    reseaux,
    lienGbp: str(b.lienGbp, 500),
    tons,
    elementsLangage: str(b.elementsLangage, 5000),
    couleursImposees: couleurs,
    policesImposees: str(b.policesImposees, 300),
    niveauAnimation: ['AUCUNE', 'SOBRE', 'MARQUEE'].includes(b.niveauAnimation) ? b.niveauAnimation : 'SOBRE',
  };
}

function offeringRows(list) {
  return (Array.isArray(list) ? list : [])
    .map((o, i) => ({
      name: str(o?.name, 200),
      description: str(o?.description, 1000),
      priceMin: intOrNull(o?.priceMin),
      priceMax: intOrNull(o?.priceMax),
      position: i,
    }))
    .filter((o) => o.name)
    .slice(0, 50);
}

async function moduleRows(list) {
  const rows = (Array.isArray(list) ? list : []).filter((m) => Number.isInteger(m?.catalogItemId));
  const existing = await prisma.catalogItem.findMany({
    where: { id: { in: rows.map((m) => m.catalogItemId) } },
    select: { id: true },
  });
  const valid = new Set(existing.map((c) => c.id));
  const seen = new Set();
  return rows
    .filter((m) => valid.has(m.catalogItemId) && !seen.has(m.catalogItemId) && seen.add(m.catalogItemId))
    .map((m) => ({ catalogItemId: m.catalogItemId, precision: str(m.precision, 500), isOption: Boolean(m.isOption) }));
}

function referenceFields(r, position) {
  const level = Math.round(Number(r?.inspirationLevel) || 3);
  return {
    url: str(r?.url, 500),
    origin: r?.origin === 'MAISON' ? 'MAISON' : 'TIERS',
    elements: strList(r?.elements).filter((e) => REFERENCE_ELEMENTS.some((x) => x.code === e)),
    likes: str(r?.likes, 2000),
    avoid: str(r?.avoid, 2000),
    inspirationLevel: Math.min(Math.max(level, 1), 5),
    position,
  };
}

/**
 * Enregistre la fiche et ses sous-listes. Les références existantes sont
 * mises à jour par id (pour garder leurs captures), les nouvelles créées,
 * celles retirées supprimées avec leurs fichiers.
 */
async function saveClient(id, body, userId) {
  const fields = clientFields(body);
  if (!fields.raisonSociale) throw badRequest('La raison sociale est obligatoire');
  const offerings = offeringRows(body.offerings);
  const modules = await moduleRows(body.modules);
  const refs = (Array.isArray(body.references) ? body.references : []).slice(0, 30);
  let removedShots = [];

  const clientId = await prisma.$transaction(async (tx) => {
    let cid = id;
    if (cid) {
      await tx.client.update({ where: { id: cid }, data: { ...fields, lastActivityAt: new Date() } });
    } else {
      cid = (await tx.client.create({ data: { ...fields, createdById: userId } })).id;
    }
    await tx.clientOffering.deleteMany({ where: { clientId: cid } });
    if (offerings.length) await tx.clientOffering.createMany({ data: offerings.map((o) => ({ ...o, clientId: cid })) });
    await tx.clientModule.deleteMany({ where: { clientId: cid } });
    if (modules.length) await tx.clientModule.createMany({ data: modules.map((m) => ({ ...m, clientId: cid })) });

    const current = await tx.visualReference.findMany({ where: { clientId: cid }, select: { id: true } });
    const keep = new Set();
    for (const [i, r] of refs.entries()) {
      const data = referenceFields(r, i);
      if (!data.url) continue;
      const refId = Number(r.id);
      if (refId && current.some((c) => c.id === refId)) {
        await tx.visualReference.update({ where: { id: refId }, data });
        keep.add(refId);
      } else {
        const created = await tx.visualReference.create({ data: { ...data, clientId: cid } });
        keep.add(created.id);
      }
    }
    const removed = current.filter((c) => !keep.has(c.id)).map((c) => c.id);
    if (removed.length) {
      removedShots = await tx.screenshot.findMany({ where: { referenceId: { in: removed } }, select: { storedName: true } });
      await tx.visualReference.deleteMany({ where: { id: { in: removed } } });
    }
    return cid;
  });

  await deleteScreenshotFiles(removedShots.map((s) => s.storedName));
  return loadClient(clientId);
}

router.get('/', async (req, res) => {
  const q = str(req.query.q, 100);
  const clients = await prisma.client.findMany({
    where: q
      ? { OR: [{ raisonSociale: { contains: q } }, { nomCommercial: { contains: q } }, { ville: { contains: q } }] }
      : undefined,
    select: {
      id: true,
      raisonSociale: true,
      nomCommercial: true,
      secteur: true,
      ville: true,
      updatedAt: true,
      createdBy: { select: { displayName: true } },
      _count: { select: { quotes: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  res.json(clients);
});

router.post('/', async (req, res) => {
  res.status(201).json(await saveClient(null, req.body || {}, req.user.id));
});

router.get('/:id', async (req, res) => {
  const client = await loadClient(idParam(req.params.id));
  if (!client) throw notFound('Fiche');
  res.json(client);
});

router.put('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  if (!(await prisma.client.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Fiche');
  res.json(await saveClient(id, req.body || {}, req.user.id));
});

// Suppression définitive (RGPD) : la confirmation se fait en retapant la raison sociale.
router.delete('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const client = await prisma.client.findUnique({ where: { id }, select: { raisonSociale: true } });
  if (!client) throw notFound('Fiche');
  if (str(req.body?.confirm) !== client.raisonSociale) {
    throw badRequest('Confirmation incorrecte : retapez la raison sociale exacte');
  }
  await deleteClientPermanently(id, req.user.id);
  res.json({ ok: true });
});
