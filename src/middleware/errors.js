export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what = 'Élément') => new HttpError(404, `${what} introuvable`);
export const badRequest = (message) => new HttpError(400, message);

/** Parse un identifiant numérique de route. */
export function idParam(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Identifiant invalide');
  return id;
}

export function errorHandler(err, req, res, _next) {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Élément introuvable' });
  if (err.code === 'P2002') return res.status(409).json({ error: 'Cette valeur existe déjà' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erreur serveur' : err.message });
}
