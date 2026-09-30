// Copie cohérente de la base SQLite, même service en marche (API de
// sauvegarde en ligne de SQLite), puis contrôle d'intégrité de la copie.
//   node scripts/backup-db.js /chemin/source.db /chemin/copie.db
import Database from 'better-sqlite3';

const [source, dest] = process.argv.slice(2);
if (!source || !dest) {
  console.error('Usage : node scripts/backup-db.js <source.db> <copie.db>');
  process.exit(1);
}
const db = new Database(source, { readonly: true, fileMustExist: true });
await db.backup(dest);
db.close();

const copy = new Database(dest, { readonly: true });
const result = copy.pragma('integrity_check', { simple: true });
copy.close();
if (result !== 'ok') {
  console.error(`✗ Copie corrompue : ${result}`);
  process.exit(1);
}
