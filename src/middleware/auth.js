import { prisma } from '../db.js';

/** Charge l'utilisateur de la session ; 401 si absent ou désactivé. */
export async function requireAuth(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ error: 'Non authentifié' });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Session expirée' });
    }
    req.user = { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: 'Accès réservé à l’administrateur' });
    next();
  };
}
