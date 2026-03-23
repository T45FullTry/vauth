import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../../../database/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
  
  console.log('Running migrations...');
  
  for (const file of files) {
    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log(`Applying migration: ${file}`);
    await db.query(sql);
    console.log(`✓ Applied: ${file}`);
  }
  
  console.log('All migrations completed successfully!');
  await db.closePool?.();
}

runMigrations().catch(console.error);
