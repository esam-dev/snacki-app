import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Uso:
//   producción (APK final / deploy): RAILWAY_API_URL=https://tu-api.up.railway.app node scripts/write-runtime-config.mjs
//   pruebas en red local:            node scripts/write-runtime-config.mjs --lan http://192.168.1.10:3000
const args = process.argv.slice(2);
const lanIndex = args.indexOf('--lan');
const lan = lanIndex !== -1;

const raw = lan ? args[lanIndex + 1] : process.env.RAILWAY_API_URL;
const apiBaseUrl = raw?.trim().replace(/\/+$/, '');

if (!apiBaseUrl) {
  throw new Error(lan
    ? 'Falta la URL. Ejemplo: npm run config:lan -- http://192.168.1.10:3000'
    : 'Falta RAILWAY_API_URL. Ejemplo: https://tu-api.up.railway.app');
}

let parsed;
try {
  parsed = new URL(apiBaseUrl);
} catch {
  throw new Error(`La URL de la API no es válida: ${apiBaseUrl}`);
}

if (!lan && parsed.protocol !== 'https:') {
  throw new Error(`RAILWAY_API_URL debe usar HTTPS en producción: ${apiBaseUrl}`);
}
if (lan && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
  throw new Error(`La URL de la API debe ser http:// o https://: ${apiBaseUrl}`);
}
if (lan && ['localhost', '127.0.0.1'].includes(parsed.hostname)) {
  throw new Error('En el celular localhost es el propio celular: usa la IP de tu PC (ipconfig), ej. http://192.168.1.10:3000');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'www', 'assets');
const target = path.join(assetsDir, 'config.json');

await mkdir(assetsDir, { recursive: true });
await writeFile(target, `${JSON.stringify({ apiBaseUrl }, null, 2)}\n`, 'utf8');
process.stdout.write(`www/assets/config.json -> ${apiBaseUrl}\n`);
