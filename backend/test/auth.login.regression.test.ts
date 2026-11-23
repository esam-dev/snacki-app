import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

const DATABASE_URL = process.env.DATABASE_URL;
const canRunIntegration = Boolean(DATABASE_URL);

async function dbAvailable() {
  if (!DATABASE_URL) return false;
  const client = new PrismaClient();
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

const integrationReady = canRunIntegration ? await dbAvailable() : false;

describe.skipIf(!integrationReady)('auth login regression (integration, real DB)', () => {
  let prisma: PrismaClient;
  let authService: typeof import('../src/modules/auth/auth.service.js').authService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    ({ authService } = await import('../src/modules/auth/auth.service.js'));
  });

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('DB schema has tenants.category (root cause of login 500)', async () => {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'category'
    `;
    expect(rows.map((r) => r.column_name)).toContain('category');
  });

  it.each([
    { identifier: 'cliente@snacki.demo', accountType: 'cliente' as const },
    { identifier: 'comercio@snacki.demo', accountType: 'comercio' as const },
  ])('login succeeds for seeded $accountType user', async ({ identifier, accountType }) => {
    const result = await authService.login({ identifier, password: 'Demo1234!', accountType });

    expect(result.user).toMatchObject({
      email: identifier,
      isActive: true,
    });
    expect(result.user.id).toEqual(expect.any(String));
    expect(result.user.fullName).toEqual(expect.any(String));

    expect(result.membership).toMatchObject({
      role: accountType,
      tenantId: expect.any(String),
      tenantSlug: expect.any(String),
      tenantName: expect.any(String),
    });

    expect(result.auth).toMatchObject({
      tokenType: 'Bearer',
      accessToken: expect.any(String),
    });
    expect(result.auth.accessToken.split('.')).toHaveLength(3);
  });
});

describe('auth login query shape (unit, mocked Prisma)', () => {
  it('does not use include: { tenant: true } on membership query', async () => {
    vi.resetModules();

    const findUnique = vi.fn().mockResolvedValue({
      id: 'u1',
      fullName: 'Test User',
      email: 'test@example.com',
      isActive: true,
      passwordHash: '$2a$10$invalidhashinvalidhashinvalidhashinvalidhashinv', // won't match
      memberships: [],
    });

    vi.doMock('../src/lib/prisma.js', () => ({
      prisma: { user: { findUnique } },
    }));

    // Mock bcrypt to avoid needing a real hash match; we only care about query shape.
    vi.doMock('bcryptjs', () => ({
      default: { compare: vi.fn().mockResolvedValue(false) },
      compare: vi.fn().mockResolvedValue(false),
    }));

    const { authService } = await import('../src/modules/auth/auth.service.js');

    await expect(
      authService.login({ identifier: 'test@example.com', password: 'bad', accountType: 'cliente' }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    expect(findUnique).toHaveBeenCalledTimes(1);
    const arg = findUnique.mock.calls[0][0];

    // Regression guard: the bug was caused by include: { tenant: true } pulling all tenant columns.
    expect(arg).toHaveProperty('select');
    expect(arg).not.toHaveProperty('include');

    const membershipQuery = arg.select?.memberships;
    expect(membershipQuery).toBeTruthy();
    expect(membershipQuery).not.toHaveProperty('include');
    expect(membershipQuery.select?.tenant?.select).toMatchObject({
      id: true,
      slug: true,
      name: true,
      isActive: true,
    });
    // Explicitly ensure we are not selecting the whole tenant (which would include category).
    expect(membershipQuery.select?.tenant).not.toHaveProperty('include');
  });
});
