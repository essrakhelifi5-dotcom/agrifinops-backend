import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Response } from 'express';
//Librairie utilisée pour créer un fichier PDF
import PDFDocument from 'pdfkit'; 
 

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // BURN VS EARN
  // Compare les revenus vs dépenses par mois
  // ─────────────────────────────────────────────
  async getBurnVsEarn(userId: string) {
  const invoices = await this.prisma.invoice.findMany({
    where: { userId },
    orderBy: { issueDate: 'asc' },
  });

  const expenses = await this.prisma.expense.findMany({
    where: { userId },
    orderBy: { expenseDate: 'asc' },
  });

  // ── Groupe par mois (Dim_Temps) ──
  const revenueByMonth: Record<string, number> = {};
  for (const inv of invoices) {
    const month = inv.issueDate.toISOString().slice(0, 7);
    //additionne les revenus
    revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(inv.totalAmount);
  }

  const expenseByMonth: Record<string, number> = {};
  for (const exp of expenses) {
    const month = exp.expenseDate.toISOString().slice(0, 7);
    expenseByMonth[month] = (expenseByMonth[month] || 0) + Number(exp.amount);
  }

  const allMonths = [...new Set([
    ...Object.keys(revenueByMonth),
    ...Object.keys(expenseByMonth),
  ])].sort();

  // ── Construit la table de faits avec Dim_Statut ──
  const data = allMonths.map(month => {
    const revenue = Math.round((revenueByMonth[month] || 0) * 100) / 100;
    const expensesVal = Math.round((expenseByMonth[month] || 0) * 100) / 100;
    const profit = Math.round((revenue - expensesVal) * 100) / 100;

    return {
      // Dim_Temps
      month,
      monthLabel: new Date(month + '-01').toLocaleDateString('fr-FR', {
        month: 'short', year: 'numeric'
      }),
      // Mesures
      revenue,
      expenses: expensesVal,
      profit,
      //Si le profit est positif ou égal à zéro : le statut est "POSITIF", sinon il est "NEGATIF"
      statut: profit >= 0 ? 'POSITIF' : 'NEGATIF',
      profitPct: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
    };
  });

  return {
    data,
    //On calcule le total des revenus.
    totalRevenue: Math.round(data.reduce((s, d) => s + d.revenue, 0) * 100) / 100,
    totalExpenses: Math.round(data.reduce((s, d) => s + d.expenses, 0) * 100) / 100,
    totalProfit: Math.round(data.reduce((s, d) => s + d.profit, 0) * 100) / 100,
  };
}

  // ─────────────────────────────────────────────
  // AR AGING
  // Groupe les factures impayées par tranche
  // ─────────────────────────────────────────────
  async getArAging(userId: string) {
  const today = new Date();

  const unpaidInvoices = await this.prisma.invoice.findMany({
    where: { userId, status: { not: 'PAID' } },
    orderBy: { issueDate: 'asc' },
  });

  const aging = {
    current:  { label: '0-30 jours',  count: 0, total: 0, statut: 'NORMAL',   alerte: '✅ Normal',     color: '#22c55e' },
    overdue30: { label: '31-60 jours', count: 0, total: 0, statut: 'ATTENTION', alerte: '⚠️ Relancer',   color: '#f59e0b' },
    overdue60: { label: '61-90 jours', count: 0, total: 0, statut: 'URGENT',    alerte: '🔴 Urgent',     color: '#ef4444' },
    overdue90: { label: '+90 jours',   count: 0, total: 0, statut: 'CRITIQUE',  alerte: '🚨 Critique',   color: '#7f1d1d' },
  };

  for (const inv of unpaidInvoices) {
    const dueDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.issueDate);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const balance = Number(inv.balance);

    if (daysOverdue <= 30)       { aging.current.count++;   aging.current.total += balance; }
    else if (daysOverdue <= 60)  { aging.overdue30.count++; aging.overdue30.total += balance; }
    else if (daysOverdue <= 90)  { aging.overdue60.count++; aging.overdue60.total += balance; }
    else                         { aging.overdue90.count++; aging.overdue90.total += balance; }
  }

  const totalAR = Object.values(aging).reduce((s, a) => s + a.total, 0);

  const data = Object.values(aging).map(a => ({
    ...a,
    total: Math.round(a.total * 100) / 100,
    // Dim_Statut
    percentage: totalAR > 0 ? Math.round((a.total / totalAR) * 10000) / 100 : 0,
  }));

  return {
    data,
    totalAR: Math.round(totalAR * 100) / 100,
    unpaidCount: unpaidInvoices.length,
    // Dim_Statut dominant
    statutDominant: data.reduce((a, b) => a.total > b.total ? a : b).statut,
  };
}

async getCategoryMargins(userId: string) {
  const lines = await this.prisma.transactionLine.findMany({
    include: { category: true, expense: true },
    where: { expense: { userId } },
  });

  const byCategory: Record<string, { amount: number; count: number }> = {};
  let totalExpenses = 0;

  for (const line of lines) {
    const name = line.category.name;
    if (!byCategory[name]) byCategory[name] = { amount: 0, count: 0 };
    byCategory[name].amount += Number(line.amount);
    byCategory[name].count++;
    totalExpenses += Number(line.amount);
  }

  const data = Object.entries(byCategory).map(([category, val]) => ({
    category,
    amount: Math.round(val.amount * 100) / 100,
    count: val.count,
    percentage: Math.round((val.amount / totalExpenses) * 10000) / 100,
    // Dim_Statut
    statut: val.amount / totalExpenses > 0.30 ? 'ELEVE' :
            val.amount / totalExpenses > 0.15 ? 'MOYEN' : 'FAIBLE',
    alerte: val.amount / totalExpenses > 0.30 ? '🔴 Élevé' :
            val.amount / totalExpenses > 0.15 ? '⚠️ Moyen' : '✅ Faible',
  })).sort((a, b) => b.amount - a.amount);

  return {
    data,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
  };
}
  // ─────────────────────────────────────────────
  // KPIs
  // Calcule les indicateurs clés financiers
  // ─────────────────────────────────────────────
  async getKpis(userId: string) {
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: { userId, status: { not: 'PAID' } },
    });
    //On calcule le total à recevoir.

//AR veut dire Accounts Receivable (montants encore non payés)
    const totalAR = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.balance), 0);

    const allExpenses = await this.prisma.expense.findMany({
      where: { userId },
      orderBy: { expenseDate: 'desc' },
    });

    const expenseByMonth: Record<string, number> = {};
    for (const exp of allExpenses) {
      const month = exp.expenseDate.toISOString().slice(0, 7);
      expenseByMonth[month] = (expenseByMonth[month] || 0) + Number(exp.amount);
    }

    const monthlyExpenses = Object.values(expenseByMonth);
    const burnRate = monthlyExpenses.length > 0
      ? monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length
      : 0;

    const allInvoices = await this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { issueDate: 'desc' },
    });
   //On calcule la moyenne des dépenses mensuelles.
    const revenueByMonth: Record<string, number> = {};
    for (const inv of allInvoices) {
      const month = inv.issueDate.toISOString().slice(0, 7);
      revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(inv.totalAmount);
    }

    const monthlyRevenues = Object.values(revenueByMonth);
    const monthlyRevenue = monthlyRevenues.length > 0
      ? monthlyRevenues.reduce((a, b) => a + b, 0) / monthlyRevenues.length
      : 0;
    //on calcule les kpi 
    const quickRatio = burnRate > 0
      ? Math.round((monthlyRevenue / burnRate) * 100) / 100
      : 0;

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



  // ─────────────────────────────────────────────
  // GENERATE PDF REPORT
  // Génère un rapport PDF complet
  // ─────────────────────────────────────────────
  async generatePDFReport(userId: string, res: Response) {
    const doc = new PDFDocument({ margin: 50 });

    // Headers pour le téléchargement
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=rapport-agrifinops-${new Date().toISOString().split('T')[0]}.pdf`,
    );

    doc.pipe(res);

    // ── Header du document ──
    doc.fontSize(20).text('Rapport Agri-FinOps', { align: 'center' });
    doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
    doc.moveDown(2);

    // ── SECTION 1 : Factures ──
    //On récupère les 50 dernières factures de l’utilisateur.
    const invoices = await this.prisma.invoice.findMany({
      where: { userId },
      orderBy: { issueDate: 'desc' },
      take: 50,
    });

    doc.fontSize(16).text('📄 Factures', { underline: true });
    doc.moveDown(0.5);

    if (invoices.length > 0) {
      doc.fontSize(10);
      invoices.forEach((invoice, index) => {
        doc.text(
          `${index + 1}. Client: ${invoice.customerName || 'N/A'} | Montant: ${invoice.totalAmount} TND | Date: ${new Date(invoice.issueDate).toLocaleDateString('fr-FR')} | Statut: ${invoice.status}`,
        );
      });
    } else {
      doc.fontSize(10).text('Aucune facture trouvée.');
    }

    doc.moveDown(2);

    // ── SECTION 2 : Dépenses ──
    const expenses = await this.prisma.expense.findMany({
      where: { userId },
      orderBy: { expenseDate: 'desc' },
      take: 50,
    });

    doc.fontSize(16).text('💸 Dépenses', { underline: true });
    doc.moveDown(0.5);

    if (expenses.length > 0) {
      doc.fontSize(10);
      expenses.forEach((expense, index) => {
        doc.text(
          `${index + 1}. Fournisseur: ${expense.vendorName || 'N/A'} | Montant: ${expense.amount} TND | Date: ${new Date(expense.expenseDate).toLocaleDateString('fr-FR')} | Description: ${expense.description}`,
        );
      });
    } else {
      doc.fontSize(10).text('Aucune dépense trouvée.');
    }

    doc.moveDown(2);

    // ── SECTION 3 : Paiements ──
    const payments = await this.prisma.payment.findMany({
      include: { invoice: true },
      take: 50,
    });

    doc.fontSize(16).text('💰 Paiements', { underline: true });
    doc.moveDown(0.5);

    if (payments.length > 0) {
      doc.fontSize(10);
      payments.forEach((payment, index) => {
        doc.text(
          `${index + 1}. Montant: ${payment.amount} TND | Date: ${new Date(payment.paymentDate).toLocaleDateString('fr-FR')} | Méthode: ${payment.method} | Facture: ${payment.invoice?.docNumber || 'N/A'}`,
        );
      });
    } else {
      doc.fontSize(10).text('Aucun paiement trouvé.');
    }

    doc.moveDown(2);

    // ── SECTION 4 : Statistiques ──
    const totalInvoices = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
    const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
    const totalPayments = payments.reduce((sum, pay) => sum + Number(pay.amount), 0);

    doc.fontSize(16).text('📊 Statistiques', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Total Factures: ${totalInvoices.toFixed(2)} TND`);
    doc.text(`Total Dépenses: ${totalExpenses.toFixed(2)} TND`);
    doc.text(`Total Paiements: ${totalPayments.toFixed(2)} TND`);
    doc.text(`Solde Net: ${(totalInvoices - totalExpenses).toFixed(2)} TND`);

    // ── Footer ──
    doc.moveDown(2);
    doc.fontSize(8).text('© 2026 Agri-FinOps - B264 Dashboard', { align: 'center' });

    doc.end();
  }
}