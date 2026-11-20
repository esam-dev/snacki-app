import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const platformSlug = process.env.PLATFORM_TENANT_SLUG || 'snacki';
  const platformName = process.env.PLATFORM_TENANT_NAME || 'Snacki';

  const platformTenant = await prisma.tenant.upsert({
    where: { slug: platformSlug },
    update: { name: platformName, isActive: true },
    create: { slug: platformSlug, name: platformName, isActive: true },
  });

  const demoTenants = [
    { name: 'Burger House', slug: 'burger-house' },
    { name: 'Pizza Hut', slug: 'pizza-hut' },
    { name: 'Quattro d', slug: 'quattro-d' },
    { name: 'Spaghettoteca', slug: 'spaghettoteca' },
  ];

  for (const tenant of demoTenants) {
    await prisma.tenant.upsert({
      where: { slug: tenant.slug },
      update: { name: tenant.name, isActive: true },
      create: { name: tenant.name, slug: tenant.slug, isActive: true },
    });
  }

  // Optional demo users for local development only.
  if (process.env.SEED_DEMO_USERS === 'true') {
    const passwordHash = await bcrypt.hash('Demo1234!', 10);

    const cliente = await prisma.user.upsert({
      where: { email: 'cliente@snacki.demo' },
      update: { fullName: 'Cliente Demo', passwordHash, isActive: true },
      create: { email: 'cliente@snacki.demo', fullName: 'Cliente Demo', passwordHash, isActive: true },
    });
    await prisma.userTenantRoleMap.upsert({
      where: { userId_tenantId: { userId: cliente.id, tenantId: platformTenant.id } },
      update: { role: 'cliente' },
      create: { userId: cliente.id, tenantId: platformTenant.id, role: 'cliente' },
    });

    const burger = await prisma.tenant.findUnique({ where: { slug: 'burger-house' } });
    if (burger) {
      const comercio = await prisma.user.upsert({
        where: { email: 'comercio@snacki.demo' },
        update: { fullName: 'Comercio Demo', passwordHash, isActive: true },
        create: { email: 'comercio@snacki.demo', fullName: 'Comercio Demo', passwordHash, isActive: true },
      });
      await prisma.userTenantRoleMap.upsert({
        where: { userId_tenantId: { userId: comercio.id, tenantId: burger.id } },
        update: { role: 'comercio' },
        create: { userId: comercio.id, tenantId: burger.id, role: 'comercio' },
      });
    }
  }

  console.log('Seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
