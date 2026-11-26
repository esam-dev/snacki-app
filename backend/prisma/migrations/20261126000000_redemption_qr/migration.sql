-- QR de canje: el comercio lo genera para una recompensa y el cliente lo escanea en el local (un solo uso).
-- CreateTable
CREATE TABLE "redemption_claims" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "reward_id" UUID NOT NULL,
    "cost" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "claimed_by_id" UUID,
    "claimed_at" TIMESTAMP(3),
    "redemption_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redemption_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "redemption_claims_redemption_id_key" ON "redemption_claims"("redemption_id");

-- CreateIndex
CREATE INDEX "redemption_claims_tenant_id_created_at_idx" ON "redemption_claims"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "redemption_claims" ADD CONSTRAINT "redemption_claims_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_claims" ADD CONSTRAINT "redemption_claims_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_claims" ADD CONSTRAINT "redemption_claims_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_claims" ADD CONSTRAINT "redemption_claims_claimed_by_id_fkey" FOREIGN KEY ("claimed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_claims" ADD CONSTRAINT "redemption_claims_redemption_id_fkey" FOREIGN KEY ("redemption_id") REFERENCES "redemptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

