-- CreateTable
CREATE TABLE "oauth_attempt" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "code_verifier" TEXT,
    "redirect_uri" TEXT NOT NULL,
    "state" TEXT,
    "nonce" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "user_id" INTEGER,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_in" INTEGER,
    "error" TEXT,
    "error_description" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oauth_attempt_status_expires_at_idx" ON "oauth_attempt"("status", "expires_at");
