import { describe, it, expect, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-16';
process.env.CORS_ORIGIN = 'https://miapp.example.com';

vi.mock('../src/lib/prisma.js', () => ({ prisma: {} }));

const { buildApp } = await import('../src/app.js');

async function allowOrigin(origin: string) {
  const app = await buildApp();
  const res = await app.inject({ method: 'OPTIONS', url: '/health', headers: { origin, 'access-control-request-method': 'GET' } });
  await app.close();
  return res.headers['access-control-allow-origin'];
}

describe('CORS', () => {
  it.each([
    'https://localhost', // WebView de Android (Capacitor)
    'capacitor://localhost', // iOS
    'ionic://localhost',
    'http://localhost:4200',
    'http://localhost',
    'https://miapp.example.com', // de CORS_ORIGIN
  ])('permite %s', async (origin) => {
    expect(await allowOrigin(origin)).toBe(origin);
  });

  it.each(['https://evil.example.com', 'https://localhost.evil.com', 'http://192.168.1.10:8100'])('rechaza %s', async (origin) => {
    expect(await allowOrigin(origin)).toBeUndefined();
  });
});
