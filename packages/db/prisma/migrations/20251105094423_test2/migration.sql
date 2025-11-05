/*
  Warnings:

  - Made the column `email` on table `app_user` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "name" TEXT,
ALTER COLUMN "email" SET NOT NULL;
