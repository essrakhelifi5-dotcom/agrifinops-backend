import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NormalizeService {
  constructor(private prisma: PrismaService) {}

  async normalizeAll(userId: string) {
    const invoicesResult = await this.normalizeInvoices(userId);
    const expensesResult = await this.normalizeExpenses(userId);
    const categoriesResult = await this.recategorizeTransactionLines();

    return {
      invoices: invoicesResult,
      expenses: expensesResult,
      categories: categoriesResult,
    };
  }

  async normalizeInvoices(userId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { userId },
    });

    let fixed = 0;

    for (const inv of invoices) {
      const updates: any = {};

      if (!inv.customerName || inv.customerName.trim() === '') {
        updates.customerName = 'Unknown Customer';
      }

      if (!inv.dueDate) {
        const due = new Date(inv.issueDate);
        due.setDate(due.getDate() + 30);
        updates.dueDate = due;
      }

      const dueDate = inv.dueDate || updates.dueDate;
      const balance = Number(inv.balance);

      if (balance === 0) {
        updates.status = 'PAID';
      } else if (dueDate && new Date(dueDate) < new Date()) {
        updates.status = 'OVERDUE';
      } else {
        updates.status = 'UNPAID';
      }

      if (Object.keys(updates).length > 0) {
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: updates,
        });
        fixed++;
      }
    }

    return { message: '✅ Invoices normalisées', fixed };
  }

  async normalizeExpenses(userId: string) {
    const expenses = await this.prisma.expense.findMany({
      where: { userId },
    });

    let fixed = 0;

    for (const exp of expenses) {
      const updates: any = {};

      if (!exp.description || exp.description.trim() === '') {
        updates.description = 'Expense';
      }

      if (!exp.vendorName) {
        updates.vendorName = 'Unknown Vendor';
      }

      if (Object.keys(updates).length > 0) {
        await this.prisma.expense.update({
          where: { id: exp.id },
          data: updates,
        });
        fixed++;
      }
    }

    return { message: '✅ Expenses normalisées', fixed };
  }

  async recategorizeTransactionLines() {
    const lines = await this.prisma.transactionLine.findMany({
      include: { category: true },
    });

    let recategorized = 0;

    for (const line of lines) {
      const newCategoryName = this.categorize(line.rawCategory);

      if (newCategoryName !== line.category.name) {
        let newCategory = await this.prisma.category.findFirst({
          where: { name: newCategoryName },
        });

        if (!newCategory) {
          newCategory = await this.prisma.category.create({
            data: { name: newCategoryName },
          });
        }

        await this.prisma.transactionLine.update({
          where: { id: line.id },
          data: { categoryId: newCategory.id },
        });

        recategorized++;
      }
    }

    return { message: '✅ TransactionLines recatégorisées', recategorized };
  }

  private categorize(rawCategory: string): string {
    const lower = rawCategory.toLowerCase();

    if (lower.includes('fuel') || lower.includes('transport') ||
        lower.includes('shipping') || lower.includes('automobile') ||
        lower.includes('vehicle') || lower.includes('gas') ||
        lower.includes('delivery') || lower.includes('freight'))
      return 'Logistics: Fuel & Transport';

    if (lower.includes('dairy') || lower.includes('meat') ||
        lower.includes('produce') || lower.includes('inventory') ||
        lower.includes('material') || lower.includes('equipment rental') ||
        lower.includes('supplies'))
      return 'Inventory: Supplies & Materials';

    if (lower.includes('salary') || lower.includes('payroll') ||
        lower.includes('wage') || lower.includes('job expenses') ||
        lower.includes('labor') || lower.includes('staff'))
      return 'Labor: Salaries & Job Expenses';

    if (lower.includes('rent') || lower.includes('utilities') ||
        lower.includes('electricity') || lower.includes('maintenance') ||
        lower.includes('repair') || lower.includes('landscaping') ||
        lower.includes('sprinkler') || lower.includes('fountain') ||
        lower.includes('cleaning') || lower.includes('office'))
      return 'Operations: Overhead';

    if (lower.includes('marketing') || lower.includes('advertising') ||
        lower.includes('promotion') || lower.includes('consulting'))
      return 'Marketing & Sales';

    if (lower.includes('meals') || lower.includes('entertainment') ||
        lower.includes('lunch') || lower.includes('dinner') ||
        lower.includes('restaurant'))
      return 'Meals & Entertainment';

    if (lower.includes('legal') || lower.includes('professional') ||
        lower.includes('accounting') || lower.includes('lawyer'))
      return 'Legal & Professional Fees';

    return 'Other';
  }
}