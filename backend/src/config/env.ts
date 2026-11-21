import 'dotenv/config';
import { z } from 'zod';

const parsed = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.coerce.number().int().positive().default(3600),
  CORS_ORIGIN: z.string().default('http://localhost:8100,http://localhost:4200'),
  PLATFORM_TENANT_NAME: z.string().min(1).default('Snacki'),
  PLATFORM_TENANT_SLUG: z.string().min(1).default('snacki'),
}).safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
};