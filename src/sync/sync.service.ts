import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QuickbooksService } from '../quickbooks/quickbooks.service';
//axios permet d’appeler l’API QuickBooks
import axios from 'axios';

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private qbService: QuickbooksService,
  ) {}

  // ─────────────────────────────────────────────
  // Méthode utilitaire : récupère le token valide
  // Utilise QuickbooksService pour refresh auto si expiré
  // ─────────────────────────────────────────────
  private async getValidToken(userId: string) {
    // ← Utilise qbService qui fait le refresh automatique
    return this.qbService.refreshTokenIfNeeded(userId);
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
    //On récupère un token QuickBooks valide
    const tokenData = await this.getValidToken(userId);
    //On construit l’URL QuickBooks pour récupérer jusqu’à 100 factures

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/query?query=SELECT * FROM Invoice MAXRESULTS 100&minorversion=65`;
   //On appelle QuickBooks avec le token
    const response = await axios.get(url, {
      headers: this.getHeaders(tokenData.accessToken),
    });
    //On récupère la liste des factures.
    //Si aucune facture n’existe, on utilise une liste vide.
    const invoices = response.data.QueryResponse?.Invoice || [];
    let created = 0;
    let updated = 0;
   //On parcourt chaque facture QuickBooks
    for (const inv of invoices) {
      //On vérifie si cette facture existe déjà dans notre base
      const existing = await this.prisma.invoice.findFirst({
        where: { qbId: inv.Id, userId },
      });
    //On calcule le statut de la facture :
//si Balance vaut 0 : PAID
//sinon si la date limite est passée : OVERDUE
//sinon : UNPAID
      const status =
        Number(inv.Balance) === 0 ? 'PAID' :
        inv.DueDate && new Date(inv.DueDate) < new Date() ? 'OVERDUE' : 'UNPAID';
      //Si la facture existe déjà, on la met à jour. Sinon, on la crée.
      if (existing) {
        await this.prisma.invoice.update({
          where: { id: existing.id },
          data: {
            totalAmount: inv.TotalAmt,
            balance: inv.Balance,
            status,
            ...(inv.DueDate && { dueDate: new Date(inv.DueDate) }),
          },
        });
        updated++;
      } else {
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
            ...(inv.DueDate && { dueDate: new Date(inv.DueDate) }),
          },
        });
        created++;
      }
    }
 
    return {
      message: 'Invoices sync terminée',
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
//On parcourt chaque dépense QuickBooks
    for (const exp of expenses) {
      const existing = await this.prisma.expense.findFirst({
        where: { qbId: exp.Id, userId },
      });

      if (existing) {
        await this.prisma.expense.update({
          where: { id: existing.id },
          data: {
            amount: exp.TotalAmt,
            description: exp.PrivateNote || 'Expense',
          },
        });
        updated++;
      } else {
        const newExpense = await this.prisma.expense.create({
          data: {
            qbId: exp.Id,
            expenseDate: new Date(exp.TxnDate),
            amount: exp.TotalAmt,
            description: exp.PrivateNote || 'Expense',
            ...(exp.EntityRef?.name && { vendorName: exp.EntityRef.name }),
            userId,
          },
        });
     //On parcourt les lignes de la dépense pour les catégoriser et les sauvegarder
        const lines = exp.Line || [];
        for (const line of lines) {
          if (!line.Amount) continue;
//On récupère la catégorie brute depuis QuickBooks
          const rawCategory =
            line.AccountBasedExpenseLineDetail?.AccountRef?.name || 'Other';
          const categoryName = this.categorize(rawCategory);
//On cherche si la catégorie existe déjà dans notre base
          let category = await this.prisma.category.findFirst({
            where: { name: categoryName },
          });
//Si la catégorie n’existe pas encore dans notre base, on la crée.
          if (!category) {
            category = await this.prisma.category.create({
              data: { name: categoryName },
            });
          }
            //On crée la ligne de dépense avec la catégorie associée
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
      message: ' Expenses sync terminée',
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
//On récupère la liste des paiements.
    //Si aucun paiement n’existe, on utilise une liste vide.
    const payments = response.data.QueryResponse?.Payment || [];
    let created = 0;

    for (const pay of payments) {
      const existing = await this.prisma.payment.findFirst({
        where: { qbId: pay.Id },
      });

      if (existing) continue;

      const qbInvoiceId = pay.Line?.[0]?.LinkedTxn?.[0]?.TxnId;
      if (!qbInvoiceId) continue;

      const invoice = await this.prisma.invoice.findFirst({
        where: { qbId: qbInvoiceId, userId },
      });
//Si la facture liée au paiement n’existe pas dans notre base, on ignore ce paiement.
      if (!invoice) continue;

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
      message: 'Payments sync terminée',
      total: payments.length,
      created,
    };
  }

  // ─────────────────────────────────────────────
  // SYNC COMPLÈTE : Lance les 3 syncs en séquence
  // Refresh automatique du token si expiré
  // ─────────────────────────────────────────────
  async syncAll(userId: string) {
    try {
      // ── Refresh token automatiquement si expiré ──
      await this.qbService.refreshTokenIfNeeded(userId);

      const invoicesResult = await this.syncInvoices(userId);
      const expensesResult = await this.syncExpenses(userId);
      const paymentsResult = await this.syncPayments(userId);

      return {
        invoices: invoicesResult,
        expenses: expensesResult,
        payments: paymentsResult,
      };
    } catch (error:any) {
      console.error(`❌ Sync échouée pour userId ${userId}:`, error.message);
      throw error;
    }
  }

  // ─────────────────────────────────────────────
  // CATÉGORISATION : Mappe les catégories brutes
  // ─────────────────────────────────────────────
  
  private categorize(rawCategory: string): string {
    //On met le texte en minuscule pour comparer plus facilement.
    const lower = rawCategory.toLowerCase();

    if (lower.includes('fuel') || lower.includes('transport') ||
        lower.includes('shipping') || lower.includes('automobile'))
      return 'Logistics: Fuel & Transport';

    if (lower.includes('dairy') || lower.includes('meat') ||
        lower.includes('produce') || lower.includes('material') ||
        lower.includes('job expenses'))
      return 'Inventory: Supplies & Materials';

    if (lower.includes('salary') || lower.includes('payroll') ||
        lower.includes('wage') || lower.includes('labor'))
      return 'Labor: Salaries & Job Expenses';

    if (lower.includes('rent') || lower.includes('utilities') ||
        lower.includes('electricity') || lower.includes('maintenance') ||
        lower.includes('repair') || lower.includes('landscaping'))
      return 'Operations: Overhead';

    if (lower.includes('marketing') || lower.includes('advertising') ||
        lower.includes('consulting'))
      return 'Marketing & Sales';

    if (lower.includes('meals') || lower.includes('entertainment') ||
        lower.includes('lunch') || lower.includes('restaurant'))
      return 'Meals & Entertainment';

    if (lower.includes('legal') || lower.includes('professional') ||
        lower.includes('accounting'))
      return 'Legal & Professional Fees';

    return 'Other';
  }
}