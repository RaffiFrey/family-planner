import { createDb } from './client.js';
import { seedGlobals } from './seed-data.js';

const url = process.env.DATABASE_MIGRATION_URL;
if (!url) throw new Error('DATABASE_MIGRATION_URL is required');
const handle = createDb(url, { max: 1, applicationName: 'fp-seed' });
try {
  const result = await seedGlobals(handle.db);
  console.log(`Seeded ${result.categories} global categories and ${result.rules} rules`);
} finally {
  await handle.close();
}
