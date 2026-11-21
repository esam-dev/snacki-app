import { z } from 'zod';

export const registerSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  accountType: z.enum(['cliente', 'comercio']),
  tenantId: z.string().uuid().nullable().optional(),
}).superRefine((d, ctx) => {
  if (d.accountType === 'comercio' && !d.tenantId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['tenantId'], message: 'tenantId es requerido para comercio' });
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  accountType: z.enum(['cliente', 'comercio']),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;