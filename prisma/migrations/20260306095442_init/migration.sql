/*
  Warnings:

  - Added the required column `realmId` to the `OAuthToken` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OAuthToken" ADD COLUMN     "realmId" TEXT NOT NULL;
