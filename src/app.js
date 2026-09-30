import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { prisma, getSettings } from './db.js';
import { PrismaSessionStore } from './session-store.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { router as authRouter } from './routes/auth.js';
import { router as clientsRouter } from './routes/clients.js';
import { router as screenshotsRouter } from './routes/screenshots.js';
import { router as quotesRouter } from './routes/quotes.js';
import { router as exportsRouter } from './routes/exports.js';
import { router as adminRouter } from './routes/admin.js';
import * as C from './services/constants.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Derrière Nginx : l'IP réelle et le HTTPS viennent des en-têtes du proxy.
  app.set('trust proxy', 'loopback');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.cookieSecure ? [] : null,
        },
      },
      strictTransportSecurity: config.cookieSecure,
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  const ttlMs = config.sessionHours * 60 * 60 * 1000;
  app.use(
    session({
      name: 'outil_devis_sid',
      secret: config.sessionSecret,
      store: new PrismaSessionStore(ttlMs),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', maxAge: ttlMs },
    }),
  );

  // Toute requête qui modifie des données doit venir du site lui-même.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (req.get('X-Requested-With') !== 'outil-devis') return res.status(403).json({ error: 'Requête refusée' });
    next();
  });

  app.get('/api/health', async (req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth);

  app.get('/api/meta', async (req, res) => {
    const s = await getSettings();
    res.json({
      categories: C.CATEGORIES,
      units: C.UNITS,
      vatRegimes: C.VAT_REGIMES,
      tones: C.TONES,
      referenceElements: C.REFERENCE_ELEMENTS,
      animationLevels: C.ANIMATION_LEVELS,
      origins: C.ORIGINS,
      paymentChoices: C.PAYMENT_CHOICES,
      days: C.DAYS,
      provider: {
        name: s.providerName,
        address: s.providerAddress,
        siret: s.providerSiret,
        vatNumber: s.providerVatNumber,
        email: s.providerEmail,
        phone: s.providerPhone,
      },
    });
  });

  // Catalogue actif lisible par tous (cases du formulaire) ; complet pour l'admin.
  app.get('/api/catalog', async (req, res) => {
    const where = req.user.role === 'ADMIN' && req.query.all ? undefined : { active: true };
    res.json(await prisma.catalogItem.findMany({ where, orderBy: [{ position: 'asc' }, { id: 'asc' }] }));
  });

  app.use('/api/clients', clientsRouter);
  app.use('/api/quotes', quotesRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', screenshotsRouter);
  app.use('/api', exportsRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));

  // Modules de calcul partagés avec le navigateur : mêmes totaux partout.
  app.get('/shared/pricing.js', (req, res) => res.type('js').sendFile(path.join(here, 'services/pricing.js')));
  app.get('/shared/constants.js', (req, res) => res.type('js').sendFile(path.join(here, 'services/constants.js')));

  app.use(express.static(path.join(here, '../public'), { extensions: ['html'], index: 'clients.html' }));

  app.use(errorHandler);
  return app;
}
