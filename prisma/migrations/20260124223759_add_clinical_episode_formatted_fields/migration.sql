-- AlterTable
ALTER TABLE "clinical_episode_notes" ADD COLUMN     "ai_meta" JSONB,
ADD COLUMN     "format_version" INTEGER,
ADD COLUMN     "formatted_at" TIMESTAMP(3),
ADD COLUMN     "formatted_body" TEXT,
ADD COLUMN     "formatted_by_user_id" TEXT;
