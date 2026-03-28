import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  // ─────────────────────────────────────────────
  // Méthode utilitaire : récupère le token valide depuis la DB
  // ─────────────────────────────────────────────
  private async getValidToken(userId: string) {
    const tokenData = await this.prisma.oAuthToken.findUnique({
      where: { userId },
    });
    if (!tokenData) throw new Error('Non connecté à QuickBooks.');
    if (new Date() > tokenData.expiresAt) throw new Error('Token expiré.');
    return tokenData;
  }

  // ─────────────────────────────────────────────
  // Méthode utilitaire : headers pour les appels QuickBooks
  // ─────────────────────────────────────────────
  private getHeaders(accessToken: string) {
    return {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };
  }

  // ─────────────────────────────────────────────
  // SYNC 1 : Synchroniser les factures (Invoices)
  // ─────────────────────────────────────────────
  async syncInvoices(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/query?query=SELECT * FROM Invoice MAXRESULTS 100&minorversion=65`;

    const response = await axios.get(url, {
      headers: this.getHeaders(tokenData.accessToken),
    });

    const invoices = response.data.QueryResponse?.Invoice || [];
    let created = 0;
    let updated = 0;

    for (const inv of invoices) {
      // Vérifie si la facture existe déjà via qbId + userId
      const existing = await this.prisma.invoice.findFirst({
        where: { qbId: inv.Id, userId },
      });

      // Détermine le statut
      const status =
        Number(inv.Balance) === 0 ? 'PAID' :
        inv.DueDate && new Date(inv.DueDate) < new Date() ? 'OVERDUE' : 'UNPAID';

      if (existing) {
        // Met à jour la facture existante
        await this.prisma.invoice.update({
          where: { id: existing.id },
          data: {
            totalAmount: inv.TotalAmt,
            balance: inv.Balance,
            status,
            // dueDate peut être undefined si absent — on ne le met à jour que si présent
            ...(inv.DueDate && { dueDate: new Date(inv.DueDate) }),
          },
        });
        updated++;
      } else {
        // Crée une nouvelle facture
        await this.prisma.invoice.create({
          data: {
            qbId: inv.Id,
            docNumber: inv.DocNumber || `INV-${inv.Id}`,
            customerName: inv.CustomerRef?.name || 'Unknown',
            issueDate: new Date(inv.TxnDate),
            totalAmount: inv.TotalAmt,
            balance: inv.Balance,
            status,
            userId,
            // dueDate optionnel
            ...(inv.DueDate && { dueDate: new Date(inv.DueDate) }),
          },
        });
        created++;
      }
    }

    return {
      message: '✅ Invoices sync terminée',
      total: invoices.length,
      created,
      updated,
    };
  }

  // ─────────────────────────────────────────────
  // SYNC 2 : Synchroniser les dépenses (Expenses)
  // ─────────────────────────────────────────────
  async syncExpenses(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/query?query=SELECT * FROM Purchase MAXRESULTS 100&minorversion=65`;

    const response = await axios.get(url, {
      headers: this.getHeaders(tokenData.accessToken),
    });

    const expenses = response.data.QueryResponse?.Purchase || [];
    let created = 0;
    let updated = 0;

    for (const exp of expenses) {
      // Vérifie si la dépense existe déjà
      const existing = await this.prisma.expense.findFirst({
        where: { qbId: exp.Id, userId },
      });

      if (existing) {
        // Met à jour la dépense existante
        await this.prisma.expense.update({
          where: { id: existing.id },
          data: {
            amount: exp.TotalAmt,
            description: exp.PrivateNote || 'Expense',
          },
        });
        updated++;
      } else {
        // Crée la dépense
        const newExpense = await this.prisma.expense.create({
          data: {
            qbId: exp.Id,
            expenseDate: new Date(exp.TxnDate),
            amount: exp.TotalAmt,
            description: exp.PrivateNote || 'Expense',
            // vendorName optionnel
            ...(exp.EntityRef?.name && { vendorName: exp.EntityRef.name }),
            userId,
          },
        });

        // Catégorise chaque ligne de la dépense
        const lines = exp.Line || [];
        for (const line of lines) {
          if (!line.Amount) continue;

          const rawCategory =
            line.AccountBasedExpenseLineDetail?.AccountRef?.name || 'Other';
          const categoryName = this.categorize(rawCategory);

          // Trouve ou crée la catégorie
          let category = await this.prisma.category.findFirst({
            where: { name: categoryName },
          });

          if (!category) {
            category = await this.prisma.category.create({
              data: { name: categoryName },
            });
          }

          // Crée la ligne de transaction
          await this.prisma.transactionLine.create({
            data: {
              description: line.Description || rawCategory,
              amount: line.Amount,
              rawCategory,
              expenseId: newExpense.id,
              categoryId: category.id,
            },
          });
        }
        created++;
      }
    }

    return {
      message: '✅ Expenses sync terminée',
      total: expenses.length,
      created,
      updated,
    };
  }

  // ─────────────────────────────────────────────
  // SYNC 3 : Synchroniser les paiements (Payments)
  // ─────────────────────────────────────────────
  async syncPayments(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/query?query=SELECT * FROM Payment MAXRESULTS 100&minorversion=65`;

    const response = await axios.get(url, {
      headers: this.getHeaders(tokenData.accessToken),
    });

    const payments = response.data.QueryResponse?.Payment || [];
    let created = 0;

    for (const pay of payments) {
      // Vérifie si le paiement existe déjà
      const existing = await this.prisma.payment.findFirst({
        where: { qbId: pay.Id },
      });

      if (existing) continue;

      // Cherche la facture liée
      const qbInvoiceId = pay.Line?.[0]?.LinkedTxn?.[0]?.TxnId;
      if (!qbInvoiceId) continue;

      const invoice = await this.prisma.invoice.findFirst({
        where: { qbId: qbInvoiceId, userId },
      });

      if (!invoice) continue;

      // Crée le paiement
      await this.prisma.payment.create({
        data: {
          qbId: pay.Id,
          paymentDate: new Date(pay.TxnDate),
          amount: pay.TotalAmt,
          method: pay.PaymentMethodRef?.name || 'Unknown',
          invoiceId: invoice.id,
        },
      });
      created++;
    }

    return {
      message: '✅ Payments sync terminée',
      total: payments.length,
      created,
    };
  }

  // ─────────────────────────────────────────────
  // SYNC COMPLÈTE : Lance les 3 syncs en séquence
  // ─────────────────────────────────────────────
  async syncAll(userId: string) {
    const invoicesResult = await this.syncInvoices(userId);
    const expensesResult = await this.syncExpenses(userId);
    const paymentsResult = await this.syncPayments(userId);

    return {
      invoices: invoicesResult,
      expenses: expensesResult,
      payments: paymentsResult,
    };
  }

  // ─────────────────────────────────────────────
  // CATÉGORISATION : Mappe les catégories brutes QuickBooks
  // vers les 5 catégories internes (sera remplacé par IA Python)
  // ─────────────────────────────────────────────
  private categorize(rawCategory: string): string {
    const lower = rawCategory.toLowerCase();

    if (lower.includes('fuel') || lower.includes('transport') || lower.includes('shipping'))
      return 'Logistics: Fuel & Transport';

    if (lower.includes('dairy') || lower.includes('meat') || lower.includes('produce'))
      return 'Inventory: Food Products';

    if (lower.includes('salary') || lower.includes('payroll') || lower.includes('wage'))
      return 'Labor: Salaries';

    if (lower.includes('rent') || lower.includes('utilities') || lower.includes('electricity'))
      return 'Operations: Overhead';

    if (lower.includes('marketing') || lower.includes('advertising'))
      return 'Marketing & Sales';

    return 'Other';
  }
}