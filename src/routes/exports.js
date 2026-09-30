import { Router } from 'express';
import fs from 'node:fs';
import archiver from 'archiver';
import { prisma, getSettings } from '../db.js';
import { notFound, idParam } from '../middleware/errors.js';
import { loadClient } from '../services/clients.js';
import { buildBrief, briefFileName, companySlug, screenshotPath } from '../services/brief.js';
import { buildQuoteMarkdown } from '../services/quote-markdown.js';
import { screenshotFile } from '../services/images.js';

export const router = Router();

function attachment(res, filename, type) {
  res.set('Content-Type', type);
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
}

router.get('/clients/:id/brief.md', async (req, res) => {
  const client = await loadClient(idParam(req.params.id));
  if (!client) throw notFound('Fiche');
  attachment(res, briefFileName(client), 'text/markdown; charset=utf-8');
  res.send(buildBrief(client));
});

// Dossier complet : le brief et les captures, nommées de façon lisible.
router.get('/clients/:id/dossier.zip', async (req, res) => {
  const client = await loadClient(idParam(req.params.id));
  if (!client) throw notFound('Fiche');
  const folder = `dossier-${companySlug(client)}`;
  attachment(res, `${folder}.zip`, 'application/zip');

  const zip = archiver('zip', { zlib: { level: 6 } });
  zip.on('error', (err) => {
    console.error(err);
    res.destroy(err);
  });
  zip.pipe(res);
  zip.append(buildBrief(client), { name: `${folder}/${briefFileName(client)}` });
  client.references.forEach((ref, i) => {
    ref.screenshots.forEach((shot, j) => {
      const file = screenshotFile(shot.storedName);
      if (file && fs.existsSync(file)) zip.file(file, { name: `${folder}/${screenshotPath(i, ref, j, shot)}` });
    });
  });
  await zip.finalize();
});

router.get('/quotes/:id/devis.md', async (req, res) => {
  const quote = await prisma.quote.findUnique({
    where: { id: idParam(req.params.id) },
    include: { lines: { orderBy: { position: 'asc' } }, client: true },
  });
  if (!quote) throw notFound('Devis');
  const settings = await getSettings();
  attachment(res, `devis-${quote.number || `brouillon-${quote.id}`}-${companySlug(quote.client)}.md`, 'text/markdown; charset=utf-8');
  res.send(buildQuoteMarkdown(quote, quote.client, settings));
});
