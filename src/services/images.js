import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';

const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

export async function ensureUploadDir() {
  await fs.mkdir(config.uploadDir, { recursive: true, mode: 0o750 });
}

/**
 * Enregistre une capture sur le disque. Au-delà de 500 Ko, elle est
 * convertie en WebP (1920 px de large au plus), qualité puis largeur
 * dégressives jusqu'à passer sous le seuil.
 */
export async function storeScreenshot(buffer) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    const err = new Error('Fichier image illisible');
    err.status = 400;
    throw err;
  }
  if (!ACCEPTED.has(meta.format)) {
    const err = new Error('Format non pris en charge (JPEG, PNG, WebP, GIF, AVIF)');
    err.status = 400;
    throw err;
  }

  let output = buffer;
  let format = meta.format;
  let { width, height } = meta;

  if (buffer.length > config.compressThresholdBytes || !MIME[format]) {
    // Qualité dégressive, puis largeur réduite si l'image reste trop lourde.
    const attempts = [
      [1920, 82], [1920, 72], [1920, 62], [1600, 62], [1280, 60], [1024, 55],
    ];
    for (const [maxWidth, quality] of attempts) {
      const { data, info } = await sharp(buffer)
        .rotate()
        .resize({ width: maxWidth, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      output = data;
      width = info.width;
      height = info.height;
      if (data.length <= config.compressThresholdBytes) break;
    }
    format = 'webp';
  }

  const storedName = `${crypto.randomUUID()}.${format === 'jpeg' ? 'jpg' : format}`;
  await ensureUploadDir();
  await fs.writeFile(path.join(config.uploadDir, storedName), output, { mode: 0o640 });
  return { storedName, mimeType: MIME[format], sizeBytes: output.length, width, height };
}

/** Chemin disque d'une capture ; refuse tout nom qui sortirait du dossier. */
export function screenshotFile(storedName) {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(storedName)) return null;
  return path.join(config.uploadDir, storedName);
}

export async function deleteScreenshotFiles(storedNames) {
  await Promise.all(
    storedNames.map((name) => {
      const file = screenshotFile(name);
      return file ? fs.rm(file, { force: true }) : null;
    }),
  );
}
