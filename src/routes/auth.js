import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma, audit } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { badRequest } from '../middleware/errors.js';

export const router = Router();

// 10 tentatives par quart d'heure et par adresse IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans quelques minutes' },
});

// Empreinte factice : le temps de réponse ne révèle pas si l'identifiant existe.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

router.post('/login', loginLimiter, async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = username ? await prisma.user.findUnique({ where: { username } }) : null;
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !ok || !user.active) {
    return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });
  }
  // Nouvel identifiant de session après connexion (fixation de session).
  req.session.regenerate(async (err) => {
    if (err) return res.status(500).json({ error: 'Erreur de session' });
    req.session.userId = user.id;
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, 'LOGIN');
    req.session.save(() =>
      res.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role }),
    );
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('outil_devis_sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, (req, res) => res.json(req.user));

router.post('/password', requireAuth, async (req, res) => {
  const { current, next } = req.body || {};
  if (!next || String(next).length < 10) throw badRequest('Le nouveau mot de passe doit faire au moins 10 caractères');
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await bcrypt.compare(String(current || ''), user.passwordHash))) {
    throw badRequest('Mot de passe actuel incorrect');
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(String(next), 12) } });
  // Les autres sessions de l'utilisateur sont fermées.
  const sessions = await prisma.session.findMany({ select: { sid: true, data: true } });
  const others = sessions.filter((s) => s.sid !== req.sessionID && JSON.parse(s.data).userId === user.id);
  await prisma.session.deleteMany({ where: { sid: { in: others.map((s) => s.sid) } } });
  await audit(user.id, 'PASSWORD_CHANGED', 'User', user.id);
  res.json({ ok: true });
});
