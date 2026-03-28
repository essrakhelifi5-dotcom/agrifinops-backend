/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[qbId,userId]` on the table `Expense` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[qbId,userId]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `qbId` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerName` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `qbId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `qbId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "qbId" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL,
ADD COLUMN     "vendorName" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "customerName" TEXT NOT NULL,
ADD COLUMN     "qbId" TEXT NOT NULL,
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "dueDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "qbId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_qbId_userId_key" ON "Expense"("qbId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_qbId_userId_key" ON "Invoice"("qbId", "userId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
