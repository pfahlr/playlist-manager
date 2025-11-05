-- CreateTable
CREATE TABLE "app_user" (
    "id" SERIAL NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider" TEXT,
    "provider_playlist_id" TEXT,
    "name" TEXT,
    "description" TEXT,
    "snapshot_hash" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_playlist" (
    "user_id" INTEGER NOT NULL,
    "playlist_id" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_playlist_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "artist" (
    "id" SERIAL NOT NULL,
    "mbid" UUID,
    "name" TEXT NOT NULL,
    "disambiguation" TEXT,
    "area" TEXT,
    "begin_year" INTEGER,
    "end_year" INTEGER,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album" (
    "id" SERIAL NOT NULL,
    "mb_release_id" UUID,
    "mb_release_group_id" UUID,
    "title" TEXT NOT NULL,
    "primary_artist_id" INTEGER,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording" (
    "id" SERIAL NOT NULL,
    "mb_recording_id" UUID,
    "title" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "isrc" TEXT,
    "album_id" INTEGER,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recording_artist" (
    "recording_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "role" TEXT,
    "ordinal" INTEGER,

    CONSTRAINT "recording_artist_pkey" PRIMARY KEY ("recording_id","artist_id")
);

-- CreateTable
CREATE TABLE "provider_track_map" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_track_id" TEXT NOT NULL,
    "recording_id" INTEGER NOT NULL,

    CONSTRAINT "provider_track_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_playlist_map" (
    "id" SERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_playlist_id" TEXT NOT NULL,
    "playlist_id" INTEGER NOT NULL,

    CONSTRAINT "provider_playlist_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_item" (
    "id" SERIAL NOT NULL,
    "playlist_id" INTEGER NOT NULL,
    "position" INTEGER,
    "recording_id" INTEGER,
    "duration_ms" INTEGER,
    "isrc" TEXT,
    "mb_recording_id" UUID,
    "mb_release_id" UUID,
    "provider_track_id" TEXT,
    "snapshot_title" TEXT,
    "snapshot_artists" TEXT,
    "snapshot_album" TEXT,
    "snapshot_expires_at" TIMESTAMPTZ,

    CONSTRAINT "playlist_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_bio" (
    "id" SERIAL NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_bio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_link" (
    "id" SERIAL NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_relation" (
    "id" SERIAL NOT NULL,
    "src_artist_id" INTEGER NOT NULL,
    "rel_type" TEXT NOT NULL,
    "dst_artist_id" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_follow" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "artist_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider_from" TEXT,
    "provider_to" TEXT,
    "playlist_id" INTEGER,
    "artifact_url" TEXT,
    "report_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "account_provider_provider_user_id_key" ON "account"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_provider_provider_playlist_id_key" ON "playlist"("provider", "provider_playlist_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_mbid_key" ON "artist"("mbid");

-- CreateIndex
CREATE UNIQUE INDEX "album_mb_release_id_key" ON "album"("mb_release_id");

-- CreateIndex
CREATE UNIQUE INDEX "recording_mb_recording_id_key" ON "recording"("mb_recording_id");

-- CreateIndex
CREATE INDEX "recording_artist_artist_id_idx" ON "recording_artist"("artist_id");

-- CreateIndex
CREATE INDEX "provider_track_map_recording_id_idx" ON "provider_track_map"("recording_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_track_map_provider_provider_track_id_key" ON "provider_track_map"("provider", "provider_track_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_playlist_map_provider_provider_playlist_id_key" ON "provider_playlist_map"("provider", "provider_playlist_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_playlist_map_playlist_id_key" ON "provider_playlist_map"("playlist_id");

-- CreateIndex
CREATE INDEX "playlist_item_playlist_id_idx" ON "playlist_item"("playlist_id");

-- CreateIndex
CREATE INDEX "playlist_item_isrc_idx" ON "playlist_item"("isrc");

-- CreateIndex
CREATE INDEX "playlist_item_mb_recording_id_idx" ON "playlist_item"("mb_recording_id");

-- CreateIndex
CREATE INDEX "playlist_item_provider_track_id_idx" ON "playlist_item"("provider_track_id");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_item_playlist_id_position_key" ON "playlist_item"("playlist_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "artist_bio_artist_id_source_key" ON "artist_bio"("artist_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "artist_link_artist_id_kind_url_key" ON "artist_link"("artist_id", "kind", "url");

-- CreateIndex
CREATE INDEX "artist_relation_src_artist_id_idx" ON "artist_relation"("src_artist_id");

-- CreateIndex
CREATE INDEX "artist_relation_dst_artist_id_idx" ON "artist_relation"("dst_artist_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_relation_src_artist_id_rel_type_dst_artist_id_key" ON "artist_relation"("src_artist_id", "rel_type", "dst_artist_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_follow_user_id_artist_id_key" ON "artist_follow"("user_id", "artist_id");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_playlist" ADD CONSTRAINT "active_playlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_playlist" ADD CONSTRAINT "active_playlist_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "album" ADD CONSTRAINT "album_primary_artist_id_fkey" FOREIGN KEY ("primary_artist_id") REFERENCES "artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording" ADD CONSTRAINT "recording_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "album"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_artist" ADD CONSTRAINT "recording_artist_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recording_artist" ADD CONSTRAINT "recording_artist_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_track_map" ADD CONSTRAINT "provider_track_map_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_playlist_map" ADD CONSTRAINT "provider_playlist_map_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_item" ADD CONSTRAINT "playlist_item_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_item" ADD CONSTRAINT "playlist_item_recording_id_fkey" FOREIGN KEY ("recording_id") REFERENCES "recording"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_bio" ADD CONSTRAINT "artist_bio_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_link" ADD CONSTRAINT "artist_link_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_relation" ADD CONSTRAINT "artist_relation_src_artist_id_fkey" FOREIGN KEY ("src_artist_id") REFERENCES "artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_relation" ADD CONSTRAINT "artist_relation_dst_artist_id_fkey" FOREIGN KEY ("dst_artist_id") REFERENCES "artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_follow" ADD CONSTRAINT "artist_follow_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_follow" ADD CONSTRAINT "artist_follow_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
