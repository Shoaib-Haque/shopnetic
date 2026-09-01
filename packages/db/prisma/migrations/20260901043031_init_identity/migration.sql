-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateEnum
CREATE TYPE "identity"."AccountPlane" AS ENUM ('marketplace', 'staff');

-- CreateEnum
CREATE TYPE "identity"."AccountStatus" AS ENUM ('active', 'locked', 'disabled', 'anonymized');

-- CreateEnum
CREATE TYPE "identity"."EmailVerificationPurpose" AS ENUM ('verify_email', 'password_reset');

-- CreateEnum
CREATE TYPE "identity"."SessionRevokedReason" AS ENUM ('logout', 'rotation', 'reuse_detected', 'admin', 'expired', 'password_change');

-- CreateEnum
CREATE TYPE "identity"."GrantScopeType" AS ENUM ('self', 'seller', 'global');

-- CreateTable
CREATE TABLE "identity"."account" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "plane" "identity"."AccountPlane" NOT NULL,
    "status" "identity"."AccountStatus" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMPTZ(6),
    "phone" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."credential" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "hash_algo" TEXT NOT NULL DEFAULT 'argon2id',
    "params" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."email_verification" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "purpose" "identity"."EmailVerificationPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."session" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" INET,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" "identity"."SessionRevokedReason",
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."totp_secret" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "totp_secret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."recovery_code" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."role" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."permission" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."role_permission" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "identity"."grant" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" "identity"."GrantScopeType" NOT NULL,
    "scope_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."staff_invite" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "invited_by_account_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_account_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."audit_event" (
    "id" UUID NOT NULL,
    "actor_account_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" INET,
    "correlation_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."outbox" (
    "id" UUID NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_email_key" ON "identity"."account"("email");

-- CreateIndex
CREATE INDEX "account_deleted_at_idx" ON "identity"."account"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "credential_account_id_key" ON "identity"."credential"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_token_hash_key" ON "identity"."email_verification"("token_hash");

-- CreateIndex
CREATE INDEX "email_verification_account_id_idx" ON "identity"."email_verification"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_refresh_token_hash_key" ON "identity"."session"("refresh_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "session_replaced_by_id_key" ON "identity"."session"("replaced_by_id");

-- CreateIndex
CREATE INDEX "session_account_id_idx" ON "identity"."session"("account_id");

-- CreateIndex
CREATE INDEX "session_family_id_idx" ON "identity"."session"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "totp_secret_account_id_key" ON "identity"."totp_secret"("account_id");

-- CreateIndex
CREATE INDEX "recovery_code_account_id_idx" ON "identity"."recovery_code"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_code_account_id_code_hash_key" ON "identity"."recovery_code"("account_id", "code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "identity"."role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permission_key_key" ON "identity"."permission"("key");

-- CreateIndex
CREATE INDEX "role_permission_permission_id_idx" ON "identity"."role_permission"("permission_id");

-- CreateIndex
CREATE INDEX "grant_role_id_idx" ON "identity"."grant"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "grant_account_id_role_id_scope_type_scope_id_key" ON "identity"."grant"("account_id", "role_id", "scope_type", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invite_token_hash_key" ON "identity"."staff_invite"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "staff_invite_accepted_account_id_key" ON "identity"."staff_invite"("accepted_account_id");

-- CreateIndex
CREATE INDEX "staff_invite_email_idx" ON "identity"."staff_invite"("email");

-- CreateIndex
CREATE INDEX "audit_event_actor_account_id_idx" ON "identity"."audit_event"("actor_account_id");

-- CreateIndex
CREATE INDEX "audit_event_target_type_target_id_idx" ON "identity"."audit_event"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_event_created_at_idx" ON "identity"."audit_event"("created_at");

-- CreateIndex
CREATE INDEX "outbox_published_at_idx" ON "identity"."outbox"("published_at");

-- AddForeignKey
ALTER TABLE "identity"."credential" ADD CONSTRAINT "credential_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."email_verification" ADD CONSTRAINT "email_verification_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."session" ADD CONSTRAINT "session_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."session" ADD CONSTRAINT "session_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "identity"."session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."totp_secret" ADD CONSTRAINT "totp_secret_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."recovery_code" ADD CONSTRAINT "recovery_code_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "identity"."permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."grant" ADD CONSTRAINT "grant_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "identity"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."grant" ADD CONSTRAINT "grant_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."staff_invite" ADD CONSTRAINT "staff_invite_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."staff_invite" ADD CONSTRAINT "staff_invite_invited_by_account_id_fkey" FOREIGN KEY ("invited_by_account_id") REFERENCES "identity"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."staff_invite" ADD CONSTRAINT "staff_invite_accepted_account_id_fkey" FOREIGN KEY ("accepted_account_id") REFERENCES "identity"."account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."audit_event" ADD CONSTRAINT "audit_event_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "identity"."account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
