import { Router } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { badRequest, notFound, idParam } from '../middleware/errors.js';
import { storeScreenshot, screenshotFile, deleteScreenshotFiles } from '../services/images.js';

export const router = Router();

// En mémoire le temps de la compression : seul le fichier final touche le disque.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 20 },
});

// Import de plusieurs captures pour une référence, avec une légende par fichier.
router.post('/references/:id/screenshots', upload.array('files', 20), async (req, res) => {
  const referenceId = idParam(req.params.id);
  const ref = await prisma.visualReference.findUnique({
    where: { id: referenceId },
    include: { _count: { select: { screenshots: true } } },
  });
  if (!ref) throw notFound('Référence');
  if (!req.files?.length) throw badRequest('Aucun fichier reçu');
  const captions = [].concat(req.body.captions ?? []);

  const created = [];
  for (const [i, file] of req.files.entries()) {
    const stored = await storeScreenshot(file.buffer);
    created.push(
      await prisma.screenshot.create({
        data: {
          ...stored,
          referenceId,
          originalName: String(file.originalname).slice(0, 200),
          caption: String(captions[i] ?? '').slice(0, 300),
          position: ref._count.screenshots + i,
        },
      }),
    );
  }
  await prisma.client.update({ where: { id: ref.clientId }, data: { lastActivityAt: new Date() } });
  res.status(201).json(created);
});

router.patch('/screenshots/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const data = {};
  if (req.body?.caption !== undefined) data.caption = String(req.body.caption).slice(0, 300);
  if (req.body?.position !== undefined) data.position = Math.max(0, Math.round(Number(req.body.position)) || 0);
  res.json(await prisma.screenshot.update({ where: { id }, data }));
});

router.delete('/screenshots/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const shot = await prisma.screenshot.delete({ where: { id } });
  await deleteScreenshotFiles([shot.storedName]);
  res.json({ ok: true });
});

// Service authentifié des fichiers : le dossier d'uploads n'est jamais exposé par Nginx.
router.get('/files/:storedName', async (req, res) => {
  const file = screenshotFile(req.params.storedName);
  const shot = file && (await prisma.screenshot.findUnique({ where: { storedName: req.params.storedName } }));
  if (!shot || !fs.existsSync(file)) throw notFound('Fichier');
  res.set('Cache-Control', 'private, max-age=86400');
  res.set('X-Content-Type-Options', 'nosniff');
  // dotfiles : le chemin est déjà validé, UPLOAD_DIR peut contenir un dossier caché.
  res.type(shot.mimeType).sendFile(file, { dotfiles: 'allow' });
});
