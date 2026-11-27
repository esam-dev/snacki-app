-- Referidos: códigos por comercio, invitaciones y bono REFERRAL_BONUS al completar la primera compra.
-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'COMPLETED');

-- AlterEnum
ALTER TYPE "PointEntryType" ADD VALUE 'REFERRAL_BONUS';

-- AlterTable
ALTER TABLE "point_entries" ADD COLUMN     "referral_id" UUID;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "referee_bonus_points" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referral_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referral_max_per_user" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "referrer_bonus_points" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "referee_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "qualifying_claim_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_user_id_tenant_id_key" ON "referral_codes"("user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_qualifying_claim_id_key" ON "referrals"("qualifying_claim_id");

-- CreateIndex
CREATE INDEX "referrals_tenant_id_referrer_id_status_idx" ON "referrals"("tenant_id", "referrer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_tenant_id_referee_id_key" ON "referrals"("tenant_id", "referee_id");

-- CreateIndex
CREATE UNIQUE INDEX "point_entries_referral_id_user_id_key" ON "point_entries"("referral_id", "user_id");

-- AddForeignKey
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_qualifying_claim_id_fkey" FOREIGN KEY ("qualifying_claim_id") REFERENCES "purchase_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

