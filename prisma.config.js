import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    // Pas de env() : il échoue quand la variable manque, or « prisma generate »
    // (lancé par npm install) n'en a pas besoin, en CI comme avant la création du .env.
    url: process.env.DATABASE_URL,
  },
});
