import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';

export type ImageKind = 'tenant' | 'product' | 'reward';

const DATA_URL_RE = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;
const HTTP_URL_RE = /^https?:\/\/\S+$/i;

/**
 * Las imágenes subidas desde el panel se guardan como data URL. Para no inflar la respuesta del
 * catálogo, el cliente recibe una URL relativa a `/api/catalog/images/...` (cacheable por el
 * navegador). Las URL http(s) y las rutas `assets/...` se entregan tal cual.
 */
export function publicImageUrl(kind: ImageKind, id: string, stored: string | null, updatedAt: Date): string | null {
  if (!stored) return null;
  return stored.startsWith('data:') ? `/api/catalog/images/${kind}/${id}?v=${updatedAt.getTime()}` : stored;
}

export const catalogService = {
  /** Comercios activos con sus promos vigentes y recompensas activas: lo que ve el cliente. */
  async listTenants() {
    const now = new Date();
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true, slug: { not: env.PLATFORM_TENANT_SLUG } },
      orderBy: { name: 'asc' },
      select: {
        id: true, slug: true, name: true, category: true, address: true,
        latitude: true, longitude: true, logoUrl: true, pointsExpireAt: true, updatedAt: true,
        products: {
          where: { isActive: true, promoStartsAt: { lte: now }, promoEndsAt: { gte: now } },
          orderBy: { promoEndsAt: 'asc' },
          select: {
            id: true, name: true, description: true, points: true, imageUrl: true,
            promoStartsAt: true, promoEndsAt: true, updatedAt: true,
          },
        },
        rewards: {
          where: { isActive: true },
          orderBy: { cost: 'asc' },
          select: { id: true, name: true, description: true, cost: true, imageUrl: true, updatedAt: true },
        },
      },
    });

    return tenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      category: t.category,
      address: t.address,
      latitude: t.latitude,
      longitude: t.longitude,
      logoUrl: publicImageUrl('tenant', t.id, t.logoUrl, t.updatedAt),
      pointsExpireAt: t.pointsExpireAt,
      products: t.products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        points: p.points,
        imageUrl: publicImageUrl('product', p.id, p.imageUrl, p.updatedAt),
        promoStartsAt: p.promoStartsAt,
        promoEndsAt: p.promoEndsAt,
      })),
      rewards: t.rewards.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        cost: r.cost,
        imageUrl: publicImageUrl('reward', r.id, r.imageUrl, r.updatedAt),
      })),
    }));
  },

  /** Devuelve los bytes de una imagen guardada como data URL, o una redirección si es una URL externa. */
  async getImage(kind: ImageKind, id: string): Promise<{ mime: string; buffer: Buffer } | { redirect: string } | null> {
    let stored: string | null | undefined;
    if (kind === 'tenant') {
      stored = (await prisma.tenant.findUnique({ where: { id }, select: { logoUrl: true } }))?.logoUrl;
    } else if (kind === 'product') {
      stored = (await prisma.product.findUnique({ where: { id }, select: { imageUrl: true } }))?.imageUrl;
    } else {
      stored = (await prisma.reward.findUnique({ where: { id }, select: { imageUrl: true } }))?.imageUrl;
    }
    if (!stored) return null;

    const match = DATA_URL_RE.exec(stored);
    if (match) return { mime: match[1]!, buffer: Buffer.from(match[2]!, 'base64') };
    if (HTTP_URL_RE.test(stored)) return { redirect: stored };
    return null;
  },
};
