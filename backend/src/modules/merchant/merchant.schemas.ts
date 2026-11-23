import { z } from 'zod';

// Imagen: URL http(s), ruta de assets del front o data URL PNG/JPG (logo subido desde el panel).
// ~1 MB de base64 como máximo; el front redimensiona antes de enviar.
const IMAGE_MAX_LENGTH = 1_000_000;
const DATA_URL_RE = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;
const HTTP_URL_RE = /^https?:\/\/\S+$/i;
const ASSET_PATH_RE = /^assets\/[\w\-./]+\.(png|jpe?g|webp|svg)$/i;

export const imageRefSchema = z
  .string()
  .max(IMAGE_MAX_LENGTH, 'La imagen es demasiado grande')
  .refine((v) => HTTP_URL_RE.test(v) || ASSET_PATH_RE.test(v) || DATA_URL_RE.test(v), {
    message: 'La imagen debe ser PNG o JPG',
  });

export const createProductSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  points: z.number().int().min(1).max(100000),
  imageUrl: imageRefSchema.optional().nullable(),
  promoStartsAt: z.string().datetime(),
  promoEndsAt: z.string().datetime(),
  isActive: z.boolean().optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  points: z.number().int().min(1).max(100000).optional(),
  imageUrl: imageRefSchema.optional().nullable(),
  promoStartsAt: z.string().datetime().optional(),
  promoEndsAt: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export const createRewardSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  cost: z.number().int().min(1).max(100000),
  imageUrl: imageRefSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateRewardSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional().nullable(),
  cost: z.number().int().min(1).max(100000).optional(),
  imageUrl: imageRefSchema.optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateMerchantSettingsSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.enum(['helado', 'comida_rapida', 'pizza', 'cafe', 'otro']).optional(),
  address: z.string().max(255).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  logoUrl: imageRefSchema.optional().nullable(),
  pointsExpireAt: z.string().datetime().optional().nullable(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CreateRewardInput = z.infer<typeof createRewardSchema>;
export type UpdateRewardInput = z.infer<typeof updateRewardSchema>;
export type UpdateMerchantSettingsInput = z.infer<typeof updateMerchantSettingsSchema>;
