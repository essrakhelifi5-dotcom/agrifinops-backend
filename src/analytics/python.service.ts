import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

// ─────────────────────────────────────────────
// PythonService — communication  backend avec FastAPI
// Appelle le service Python sur port 8000
// ─────────────────────────────────────────────
@Injectable()
export class PythonService {
  private readonly PYTHON_URL = 'http://localhost:8000';

  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // Catégorisation IA des dépenses
  // Envoie les dépenses à Python pour classification
  // ─────────────────────────────────────────────
  async categorizeExpenses(userId: string) {
    // Récupère les dépenses avec leurs lignes de transaction
    const expenses = await this.prisma.expense.findMany({
      where: { userId },
      include: { transactionLines: true },
    });
  
    // Prépare les données pour Python
    const expenseItems = expenses.flatMap(exp =>
      exp.transactionLines.map(line => ({
        description: line.description,
        amount: Number(line.amount),
        rawCategory: line.rawCategory,
      }))
    );

    if (expenseItems.length === 0) {
      return { message: 'Aucune dépense à catégoriser', results: [] };
    }

    // Appel Python FastAPI
    const response = await axios.post(`${this.PYTHON_URL}/categorize`, {
      expenses: expenseItems,
    });

    // Met à jour les catégories en DB avec les prédictions IA
    for (const result of response.data.results) {
      const categoryName = result.predictedCategory;

      // Trouve ou crée la catégorie
      let category = await this.prisma.category.findFirst({
        where: { name: categoryName },
      });

      if (!category) {
        category = await this.prisma.category.create({
          data: { name: categoryName },
        });
      }

      // Met à jour la ligne de transaction avec la catégorie IA
      await this.prisma.transactionLine.updateMany({
        where: {
          rawCategory: result.rawCategory,
          expense: { userId },
        },
        data: { categoryId: category.id },
      });
    }

    return {
      message: '✅ Catégorisation IA terminée',
      total: response.data.total,
      results: response.data.results,
    };
  }

  // ─────────────────────────────────────────────
  // Calculs financiers avancés via Python
  // Burn Rate, Quick Ratio, Gross Margin avec tendances
  // ─────────────────────────────────────────────
  async getFinancialRatios(userId: string) {
    // Récupère les revenus par mois
    const invoices = await this.prisma.invoice.findMany({
      where: { userId },
      // de la plus ancienne à la plus récente
      orderBy: { issueDate: 'asc' },
    });

    // Récupère les dépenses par mois
    const expenses = await this.prisma.expense.findMany({
      where: { userId },
      orderBy: { expenseDate: 'asc' },
    });

    // Groupe par mois
    const revenueByMonth: Record<string, number> = {};
    for (const inv of invoices) {
      const month = inv.issueDate.toISOString().slice(0, 7);
      revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(inv.totalAmount);
    }
    
    const expenseByMonth: Record<string, number> = {};
    for (const exp of expenses) {
      const month = exp.expenseDate.toISOString().slice(0, 7);
      expenseByMonth[month] = (expenseByMonth[month] || 0) + Number(exp.amount);
    }

    // Total AR
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: { userId, status: { not: 'PAID' } },
    });
    const totalAR = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.balance), 0);

    // Appel Python FastAPI
    //On envoie les données à Python vers:

const response = await axios.post(`${this.PYTHON_URL}/financial-ratios`, {
      monthly_revenues: Object.values(revenueByMonth),
      monthly_expenses: Object.values(expenseByMonth),
      total_ar: totalAR,
    });

    return response.data;
  }

  // ─────────────────────────────────────────────
  // Prédiction Cash Flow 30 jours
  // Régression linéaire via Python
  // ─────────────────────────────────────────────
 async predictCashFlow(userId: string) {
  const invoices = await this.prisma.invoice.findMany({
    where: { userId },
    orderBy: { issueDate: 'asc' },
  });

  const expenses = await this.prisma.expense.findMany({
    where: { userId },
    orderBy: { expenseDate: 'asc' },
  });

  const revenueByMonth: Record<string, number> = {};
  for (const inv of invoices) {
    const month = inv.issueDate.toISOString().slice(0, 7);
    revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(inv.totalAmount);
  }

  const expenseByMonth: Record<string, number> = {};
  for (const exp of expenses) {
    const month = exp.expenseDate.toISOString().slice(0, 7);
    expenseByMonth[month] = (expenseByMonth[month] || 0) + Number(exp.amount);
  }

  const response = await axios.post(`${this.PYTHON_URL}/predict-cashflow`, {
    monthly_revenues: Object.values(revenueByMonth),
    monthly_expenses: Object.values(expenseByMonth),
  });

  // ── Enrichit avec Dim_Statut ──
  const enrichedPredictions = response.data.predictions.map((pred: any) => ({
    ...pred,
    // Dim_Statut
    statut: pred.predictedProfit >= 0 ? 'POSITIF' : 'NEGATIF',
    // Dim_Alerte
    alerte: pred.predictedProfit < 0 ? '🔴 Risque déficit' :
            pred.predictedProfit < 500 ? '🟡 Marge faible' : '✅ Bonne santé',
    profitPct: pred.predictedRevenue > 0
      ? Math.round((pred.predictedProfit / pred.predictedRevenue) * 100)
      : 0,
  }));

  return {
    predictions: enrichedPredictions,
    modelConfidence: response.data.modelConfidence,
    message: response.data.message,
  };
}
}