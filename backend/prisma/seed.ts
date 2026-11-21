import { PrismaClient, TenantCategory } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysFromNow = (d: number) => new Date(now + d * DAY);

type SeedTenant = {
  name: string;
  slug: string;
  category: TenantCategory;
  address: string;
  latitude: number;
  longitude: number;
  logoUrl: string | null;
  products: { name: string; description: string; points: number; imageUrl: string | null }[];
  rewards: { name: string; cost: number }[];
};

// Coordenadas de ejemplo cercanas entre sí para probar "comercios cercanos".
const TENANTS: SeedTenant[] = [
  {
    name: 'Burger House', slug: 'burger-house', category: 'comida_rapida',
    address: 'Av. Principal 120', latitude: -33.4372, longitude: -70.6506,
    logoUrl: 'assets/img/logo-burger-house.png',
    products: [
      { name: 'Combo Bacon nuevo', description: 'Hamburguesa con bacon, papas y bebida', points: 300, imageUrl: 'assets/img/prod-combo-bacon.jpg' },
      { name: 'Nuggets x10', description: 'Nuevos nuggets crujientes', points: 150, imageUrl: 'assets/img/prod-nuggets.jpg' },
    ],
    rewards: [{ name: 'Papas medianas gratis', cost: 600 }, { name: 'Combo Bacon gratis', cost: 2500 }],
  },
  {
    name: 'Pizza Hut', slug: 'pizza-hut', category: 'pizza',
    address: 'Calle Comercio 455', latitude: -33.4410, longitude: -70.6480,
    logoUrl: 'assets/img/logo-pizza-hut.png',
    products: [{ name: 'Pizza Pepperoni Extra', description: 'Lanzamiento con doble pepperoni', points: 400, imageUrl: null }],
    rewards: [{ name: 'Bebida 1.5L gratis', cost: 800 }, { name: 'Pizza mediana gratis', cost: 3000 }],
  },
  {
    name: 'Quattro D', slug: 'quattro-d', category: 'helado',
    address: 'Paseo Central 78', latitude: -33.4355, longitude: -70.6530,
    logoUrl: 'assets/img/logo-quattro-d.png',
    products: [{ name: 'Helado Pistacho Crunch', description: 'Nuevo sabor de temporada', points: 200, imageUrl: 'assets/img/prod-helado.jpg' }],
    rewards: [{ name: 'Cono simple gratis', cost: 1000 }],
  },
  {
    name: 'Café Central', slug: 'cafe-central', category: 'cafe',
    address: 'Plaza Mayor 10', latitude: -33.4390, longitude: -70.6550,
    logoUrl: null,
    products: [
      { name: 'Latte Caramelo', description: 'Café mediano nuevo', points: 250, imageUrl: null },
      { name: 'Ensalada Fresca', description: 'Nueva opción liviana', points: 200, imageUrl: 'assets/img/prod-ensalada.jpg' },
    ],
    rewards: [{ name: 'Café chico gratis', cost: 1500 }, { name: 'Café mediano gratis', cost: 2500 }],
  },
  {
    name: 'Spaghettoteca', slug: 'spaghettoteca', category: 'otro',
    address: 'Av. Italia 300', latitude: -33.4425, longitude: -70.6520,
    logoUrl: 'assets/img/logo-spaghettoteca.png',
    products: [{ name: 'Spaghetti Pesto', description: 'Nuevo plato de la casa', points: 350, imageUrl: null }],
    rewards: [{ name: 'Postre gratis', cost: 1200 }],
  },
];

async function main() {
  const platform = await prisma.tenant.upsert({
    where: { slug: process.env.PLATFORM_TENANT_SLUG || 'snacki' },
    update: { name: process.env.PLATFORM_TENANT_NAME || 'Snacki', isActive: true },
    create: { slug: process.env.PLATFORM_TENANT_SLUG || 'snacki', name: process.env.PLATFORM_TENANT_NAME || 'Snacki', isActive: true },
  });

  const tenantIds: Record<string, string> = {};
  for (const t of TENANTS) {
    const data = {
      name: t.name, category: t.category, address: t.address, latitude: t.latitude,
      longitude: t.longitude, logoUrl: t.logoUrl, pointsExpireAt: daysFromNow(90), isActive: true,
    };
    const tenant = await prisma.tenant.upsert({ where: { slug: t.slug }, update: data, create: { slug: t.slug, ...data } });
    tenantIds[t.slug] = tenant.id;

    // Catálogo idempotente: se reemplaza en cada seed (sin tocar lo que ya tiene QR o canjes).
    await prisma.$transaction([
      prisma.product.deleteMany({ where: { tenantId: tenant.id, claims: { none: {} } } }),
      prisma.reward.deleteMany({ where: { tenantId: tenant.id, redemptions: { none: {} } } }),
      prisma.product.createMany({
        data: t.products.map((p) => ({ ...p, tenantId: tenant.id, promoStartsAt: daysFromNow(-1), promoEndsAt: daysFromNow(30) })),
      }),
      prisma.reward.createMany({ data: t.rewards.map((r) => ({ ...r, tenantId: tenant.id })) }),
    ]);
  }

  if (process.env.SEED_DEMO_USERS === 'true') {
    const passwordHash = await bcrypt.hash('Demo1234!', 10);

    const cliente = await prisma.user.upsert({
      where: { email: 'cliente@snacki.demo' },
      update: { fullName: 'Cliente Demo', passwordHash, isActive: true },
      create: { email: 'cliente@snacki.demo', fullName: 'Cliente Demo', passwordHash, isActive: true },
    });
    await prisma.userTenantRoleMap.upsert({
      where: { userId_tenantId: { userId: cliente.id, tenantId: platform.id } },
      update: { role: 'cliente' },
      create: { userId: cliente.id, tenantId: platform.id, role: 'cliente' },
    });

    const comercio = await prisma.user.upsert({
      where: { email: 'comercio@snacki.demo' },
      update: { fullName: 'Comercio Demo', passwordHash, isActive: true },
      create: { email: 'comercio@snacki.demo', fullName: 'Comercio Demo', passwordHash, isActive: true },
    });
    await prisma.userTenantRoleMap.upsert({
      where: { userId_tenantId: { userId: comercio.id, tenantId: tenantIds['burger-house'] } },
      update: { role: 'comercio' },
      create: { userId: comercio.id, tenantId: tenantIds['burger-house'], role: 'comercio' },
    });

    // Saldo inicial de ejemplo (entradas sin QR ni canje asociado, se recrean en cada seed).
    await prisma.pointEntry.deleteMany({ where: { userId: cliente.id, claimId: null, rewardId: null } });
    await prisma.pointEntry.createMany({
      data: [
        { slug: 'burger-house', points: 450, expires: 60 },
        { slug: 'cafe-central', points: 1750, expires: 60 },
        { slug: 'quattro-d', points: 300, expires: -1 }, // vencido: no debe contar en el saldo
      ].map((e) => ({
        userId: cliente.id, tenantId: tenantIds[e.slug], type: 'EARN' as const,
        points: e.points, remaining: e.points, expiresAt: daysFromNow(e.expires),
      })),
    });
  }

  console.log('Seed completed');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
