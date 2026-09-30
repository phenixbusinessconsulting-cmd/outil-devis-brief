import session from 'express-session';
import { prisma } from './db.js';

/**
 * Sessions persistées en SQLite via Prisma : elles survivent à un
 * redémarrage du service, sans dépendance supplémentaire.
 */
export class PrismaSessionStore extends session.Store {
  constructor(ttlMs) {
    super();
    this.ttlMs = ttlMs;
    // Ménage des sessions expirées toutes les heures.
    this.timer = setInterval(() => {
      prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
    }, 60 * 60 * 1000);
    this.timer.unref();
  }

  expiry(sess) {
    const cookieExpiry = sess?.cookie?.expires ? new Date(sess.cookie.expires) : null;
    return cookieExpiry || new Date(Date.now() + this.ttlMs);
  }

  get(sid, cb) {
    prisma.session
      .findUnique({ where: { sid } })
      .then((row) => {
        if (!row || row.expiresAt < new Date()) return cb(null, null);
        cb(null, JSON.parse(row.data));
      })
      .catch(cb);
  }

  set(sid, sess, cb = () => {}) {
    const data = JSON.stringify(sess);
    const expiresAt = this.expiry(sess);
    prisma.session
      .upsert({ where: { sid }, update: { data, expiresAt }, create: { sid, data, expiresAt } })
      .then(() => cb(null))
      .catch(cb);
  }

  touch(sid, sess, cb = () => {}) {
    prisma.session
      .updateMany({ where: { sid }, data: { expiresAt: this.expiry(sess) } })
      .then(() => cb(null))
      .catch(cb);
  }

  destroy(sid, cb = () => {}) {
    prisma.session
      .deleteMany({ where: { sid } })
      .then(() => cb(null))
      .catch(cb);
  }
}
