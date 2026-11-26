-- Sucursales: los asistentes proponen cambios de promos y recompensas que aprueba un titular.
-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('owner', 'assistant');
CREATE TYPE "ChangeEntity" AS ENUM ('product', 'reward');
CREATE TYPE "ChangeAction" AS ENUM ('create', 'update', 'delete');
CREATE TYPE "ChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: las cuentas existentes siguen siendo titulares
ALTER TABLE "user_tenant_roles" ADD COLUMN "staff_role" "StaffRole" NOT NULL DEFAULT 'owner';

-- CreateTable
CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "entity" "ChangeEntity" NOT NULL,
    "action" "ChangeAction" NOT NULL,
    "target_id" UUID,
    "target_name" TEXT,
    "payload" JSONB,
    "status" "ChangeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_requests_tenant_id_status_created_at_idx" ON "change_requests"("tenant_id", "status", "created_at");
CREATE INDEX "change_requests_requested_by_id_idx" ON "change_requests"("requested_by_id");

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
