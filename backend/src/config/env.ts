import 'dotenv/config';
import { z } from 'zod';

const parsed = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(3600),
  // Firma de los QR de compra. Obligatoria en producción; en desarrollo se deriva de JWT_SECRET.
  QR_SECRET: z.string().min(16).optional(),
  CORS_ORIGIN: z.string().default('http://localhost:8100,http://localhost:4200'),
  PLATFORM_TENANT_NAME: z.string().min(1).default('Snacki'),
  PLATFORM_TENANT_SLUG: z.string().min(1).default('snacki'),
}).safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

if (parsed.data.NODE_ENV === 'production' && !parsed.data.QR_SECRET) {
  console.error('Invalid environment variables', { QR_SECRET: ['Required in production'] });
  throw new Error('Invalid environment variables');
}

export const env = {
  ...parsed.data,
  qrSecret: parsed.data.QR_SECRET ?? `${parsed.data.JWT_SECRET}:qr`,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
};