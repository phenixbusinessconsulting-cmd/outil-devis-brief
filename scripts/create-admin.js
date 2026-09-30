// Création d'un administrateur (aucun compte n'existe par défaut).
//   npm run create-admin -- --username prenom.nom --name "Prénom Nom"
// Le mot de passe est demandé au clavier, sans écho, jamais en argument
// (il resterait dans l'historique du shell).
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    name: { type: 'string' },
  },
});

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    });
  });
}

const username = (values.username || (await ask('Identifiant : '))).toLowerCase();
if (!/^[a-z0-9._-]{3,}$/.test(username)) {
  console.error('✗ Identifiant : 3 caractères minimum, lettres, chiffres, . _ -');
  process.exit(1);
}
if (await prisma.user.findUnique({ where: { username } })) {
  console.error(`✗ L’identifiant « ${username} » existe déjà`);
  process.exit(1);
}
const displayName = values.name || (await ask('Nom affiché : ')) || username;

// Lecture non interactive possible : echo "motdepasse" | npm run create-admin -- …
let password;
if (process.stdin.isTTY) {
  password = await askHidden('Mot de passe (10 caractères minimum) : ');
  const confirm = await askHidden('Confirmer le mot de passe : ');
  if (password !== confirm) {
    console.error('✗ Les deux saisies diffèrent');
    process.exit(1);
  }
} else {
  password = (await new Promise((r) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c)).on('end', () => r(data));
  })).split('\n')[0];
}
if (password.length < 10) {
  console.error('✗ Mot de passe trop court (10 caractères minimum)');
  process.exit(1);
}

const user = await prisma.user.create({
  data: { username, displayName, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) },
});
await prisma.auditLog.create({ data: { userId: user.id, action: 'ADMIN_CREATED_CLI', entity: 'User', entityId: user.id } });
console.log(`✓ Administrateur « ${username} » créé`);
await prisma.$disconnect();
