import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // BURN VS EARN
  // Compare les revenus (invoices) vs dépenses (expenses) par mois
  // Utilisé pour le graphique line chart du dashboard CEO
  // ─────────────────────────────────────────────
  async getBurnVsEarn(userId: string) {
    // Récupère toutes les factures payées de l'utilisateur
    const invoices = await this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { issueDate: 'asc' },
    });

    // Récupère toutes les dépenses de l'utilisateur
    const expenses = await this.prisma.expense.findMany({
      where: { userId },
      orderBy: { expenseDate: 'asc' },
    });

    // Groupe les revenus par mois
    const revenueByMonth: Record<string, number> = {};
    for (const inv of invoices) {
      const month = inv.issueDate.toISOString().slice(0, 7); // "2026-01"
      revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(inv.totalAmount);
    }

    // Groupe les dépenses par mois
    const expenseByMonth: Record<string, number> = {};
    for (const exp of expenses) {
      const month = exp.expenseDate.toISOString().slice(0, 7); // "2026-01"
      expenseByMonth[month] = (expenseByMonth[month] || 0) + Number(exp.amount);
    }

    // Combine les 2 en une seule liste triée par mois
    const allMonths = [...new Set([
      ...Object.keys(revenueByMonth),
      ...Object.keys(expenseByMonth),
    ])].sort();

    const data = allMonths.map(month => ({
      month,
      revenue: Math.round((revenueByMonth[month] || 0) * 100) / 100,
      expenses: Math.round((expenseByMonth[month] || 0) * 100) / 100,
      profit: Math.round(((revenueByMonth[month] || 0) - (expenseByMonth[month] || 0)) * 100) / 100,
    }));

    return { data };
  }

  // ─────────────────────────────────────────────
  // AR AGING
  // Groupe les factures impayées par tranche de retard
  // Utilisé pour le bar chart du dashboard Manager
  // ─────────────────────────────────────────────
  async getArAging(userId: string) {
    const today = new Date();

    // Récupère toutes les factures non payées
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        userId,
        status: { not: 'PAID' },
      },
    });

    // Initialise les tranches
    const aging = {
      current: { label: '0-30 jours', count: 0, total: 0 },
      overdue30: { label: '31-60 jours', count: 0, total: 0 },
      overdue60: { label: '61-90 jours', count: 0, total: 0 },
      overdue90: { label: '+90 jours', count: 0, total: 0 },
    };

    for (const inv of unpaidInvoices) {
      const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.issueDate);
      // Calcule le nombre de jours de retard
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const balance = Number(inv.balance);

      if (daysOverdue <= 30) {
        aging.current.count++;
        aging.current.total += balance;
      } else if (daysOverdue <= 60) {
        aging.overdue30.count++;
        aging.overdue30.total += balance;
      } else if (daysOverdue <= 90) {
        aging.overdue60.count++;
        aging.overdue60.total += balance;
      } else {
        aging.overdue90.count++;
        aging.overdue90.total += balance;
      }
    }

    // Arrondit les totaux
    Object.values(aging).forEach(a => {
      a.total = Math.round(a.total * 100) / 100;
    });

    return { data: Object.values(aging) };
  }

  // ─────────────────────────────────────────────
  // CATEGORY MARGINS
  // Calcule les dépenses totales par catégorie
  // Utilisé pour le heatmap du dashboard CEO
  // ─────────────────────────────────────────────
  async getCategoryMargins(userId: string) {
    // Récupère toutes les lignes de transaction avec leur catégorie
    const lines = await this.prisma.transactionLine.findMany({
      include: { category: true, expense: true },
      where: {
        expense: { userId },
      },
    });

    // Groupe par catégorie
    const byCategory: Record<string, number> = {};
    let totalExpenses = 0;

    for (const line of lines) {
      const categoryName = line.category.name;
      byCategory[categoryName] = (byCategory[categoryName] || 0) + Number(line.amount);
      totalExpenses += Number(line.amount);
    }

    // Calcule le pourcentage par catégorie
    const data = Object.entries(byCategory).map(([category, amount]) => ({
      category,
      amount: Math.round(amount * 100) / 100,
      percentage: Math.round((amount / totalExpenses) * 10000) / 100,
    })).sort((a, b) => b.amount - a.amount);

    return { data, totalExpenses: Math.round(totalExpenses * 100) / 100 };
  }

  // ─────────────────────────────────────────────
  // KPIs
  // Calcule les indicateurs clés financiers
  // Utilisé pour les cards en haut du dashboard CEO
  // ─────────────────────────────────────────────
  async getKpis(userId: string) {
  // Total des factures impayées (AR)
  const unpaidInvoices = await this.prisma.invoice.findMany({
    where: { userId, status: { not: 'PAID' } },
  });
  const totalAR = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.balance), 0);

  // ── Burn Rate : moyenne mensuelle sur toutes les dépenses ──
  // On prend les 3 derniers mois de données disponibles
  const allExpenses = await this.prisma.expense.findMany({
    where: { userId },
    orderBy: { expenseDate: 'desc' },
  });

  // Groupe par mois
  const expenseByMonth: Record<string, number> = {};
  for (const exp of allExpenses) {
    const month = exp.expenseDate.toISOString().slice(0, 7);
    expenseByMonth[month] = (expenseByMonth[month] || 0) + Number(exp.amount);
  }

  // Calcule la moyenne mensuelle
  const monthlyExpenses = Object.values(expenseByMonth);
  const burnRate = monthlyExpenses.length > 0
    ? monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length
    : 0;

  // ── Monthly Revenue : moyenne mensuelle sur toutes les factures ──
  const allInvoices = await this.prisma.invoice.findMany({
    where: { userId },
    orderBy: { issueDate: 'desc' },
  });

  // Groupe par mois
  const revenueByMonth: Record<string, number> = {};
  for (const inv of allInvoices) {
    const month = inv.issueDate.toISOString().slice(0, 7);
    revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(inv.totalAmount);
  }

  // Calcule la moyenne mensuelle
  const monthlyRevenues = Object.values(revenueByMonth);
  const monthlyRevenue = monthlyRevenues.length > 0
    ? monthlyRevenues.reduce((a, b) => a + b, 0) / monthlyRevenues.length
    : 0;

  // Quick Ratio = revenus moyens / dépenses moyennes
  const quickRatio = burnRate > 0
    ? Math.round((monthlyRevenue / burnRate) * 100) / 100
    : 0;

  // Runway = totalAR / burnRate mensuel
  const runway = burnRate > 0
    ? Math.round((totalAR / burnRate) * 10) / 10
    : 0;

  return {
    totalAR: Math.round(totalAR * 100) / 100,
    burnRate: Math.round(burnRate * 100) / 100,
    monthlyRevenue: Math.round(monthlyRevenue * 100) / 100,
    quickRatio,
    runway,
    unpaidInvoicesCount: unpaidInvoices.length,
  };
}
}