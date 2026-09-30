import 'dotenv/config';
import path from 'node:path';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ Variable ${name} absente du .env (voir .env.example)`);
    process.exit(1);
  }
  return value;
}

const isProd = process.env.NODE_ENV === 'production';
const sessionSecret = required('SESSION_SECRET');
if (isProd && (sessionSecret.length < 32 || sessionSecret.startsWith('remplacer'))) {
  console.error('✗ SESSION_SECRET doit être une chaîne aléatoire d’au moins 32 caractères');
  process.exit(1);
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 3100),
  host: process.env.HOST || '127.0.0.1',
  databaseUrl: required('DATABASE_URL'),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  sessionSecret,
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 15),
  // Au-delà, la capture est recompressée.
  compressThresholdBytes: 500 * 1024,
};
