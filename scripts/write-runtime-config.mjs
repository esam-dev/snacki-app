import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiBaseUrl = process.env.RAILWAY_API_URL?.trim().replace(/\/+$/, '');

if (!apiBaseUrl) {
  throw new Error('Falta RAILWAY_API_URL. Ejemplo: https://tu-api.up.railway.app');
}

let parsed;
try {
  parsed = new URL(apiBaseUrl);
} catch {
  throw new Error(`RAILWAY_API_URL no es válida: ${apiBaseUrl}`);
}

if (parsed.protocol !== 'https:') {
  throw new Error(`RAILWAY_API_URL debe usar HTTPS en producción: ${apiBaseUrl}`);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'www', 'assets');
const target = path.join(assetsDir, 'config.json');

await mkdir(assetsDir, { recursive: true });
await writeFile(target, `${JSON.stringify({ apiBaseUrl }, null, 2)}\n`, 'utf8');
process.stdout.write(`www/assets/config.json -> ${apiBaseUrl}\n`);
