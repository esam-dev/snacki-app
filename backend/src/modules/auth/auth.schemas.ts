import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().trim().min(1, 'Nombre requerido').max(120),
  email: z.string().trim().email('Formato inválido').transform((v) => v.toLowerCase()),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  accountType: z.enum(['cliente', 'comercio']),
  tenantId: z.string().uuid().nullable().optional(),
}).superRefine((data, ctx) => {
  if (data.accountType === 'comercio' && !data.tenantId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tenantId'], message: 'tenantId es requerido para comercio' });
  }
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Identificador requerido'),
  password: z.string().min(1, 'Contraseña requerida'),
  accountType: z.enum(['cliente', 'comercio']),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
