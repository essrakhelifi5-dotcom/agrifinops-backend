import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

@Injectable()
export class ChatbotService {
  private openai: OpenAI;
  private conversationHistory: Map<string, any[]> = new Map();

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    
    if (!apiKey) {
      console.warn('⚠️ OPENAI_API_KEY manquante. Chatbot en mode fallback.');
    }

    this.openai = new OpenAI({
      apiKey: apiKey || 'sk-dummy',
    });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RÉCUPÉRER CONTEXTE DASHBOARD (CEO + MANAGER + ADMIN)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async getDashboardContext(userId: string): Promise<string> {
    try {
      // 1️⃣ Récupérer l'utilisateur connecté
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, name: true, email: true },
      });

      if (!currentUser) {
        return '';
      }

      let context = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 DONNÉES RÉELLES DU DASHBOARD (EN TEMPS RÉEL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 UTILISATEUR CONNECTÉ :
- Nom : ${currentUser.name}
- Email : ${currentUser.email}
- Rôle : ${currentUser.role}
`;

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CONTEXTE ADMIN
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (currentUser.role === 'Admin') {
        const allUsers = await this.prisma.user.findMany({
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
            _count: { select: { invoices: true, expenses: true } },
          },
          orderBy: { createdAt: 'desc' },
        });

        const totalUsers = allUsers.length;
        const activeUsers = allUsers.filter(u => u.isActive).length;
        const inactiveUsers = totalUsers - activeUsers;
        const ceoCount = allUsers.filter(u => u.role === 'CEO').length;
        const managerCount = allUsers.filter(u => u.role === 'Manager').length;
        const adminCount = allUsers.filter(u => u.role === 'Admin').length;

        const activeQBConnections = await this.prisma.oAuthToken.count({
          where: { expiresAt: { gt: new Date() } },
        });

        const totalInvoices = await this.prisma.invoice.count();
        const totalExpenses = await this.prisma.expense.count();
        const totalPayments = await this.prisma.payment.count();

        context += `
📈 STATISTIQUES SYSTÈME :
- Total utilisateurs : ${totalUsers}
- Utilisateurs actifs : ${activeUsers}
- Utilisateurs inactifs : ${inactiveUsers}

👥 RÉPARTITION PAR RÔLE :
- CEO : ${ceoCount}
- Manager : ${managerCount}
- Admin : ${adminCount}

🔗 QUICKBOOKS :
- Connexions actives : ${activeQBConnections}
- Total factures : ${totalInvoices}
- Total dépenses : ${totalExpenses}
- Total paiements : ${totalPayments}

👥 LISTE UTILISATEURS (${totalUsers}) :
`;
        allUsers.forEach((user, index) => {
          context += `
${index + 1}. ${user.name}
   - Email : ${user.email}
   - Rôle : ${user.role}
   - Statut : ${user.isActive ? '✅ Actif' : '❌ Inactif'}
   - Date création : ${new Date(user.createdAt).toLocaleDateString('fr-FR')}
   - Factures : ${user._count.invoices}
   - Dépenses : ${user._count.expenses}
`;
        });

        context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 ACTIONS ADMIN :
✅ BF1 - Consulter utilisateurs
✅ BF2 - Créer utilisateur (CEO/Manager)
✅ BF3 - Modifier utilisateur
✅ BF4 - Supprimer utilisateur (sauf Admin)
✅ BF5 - Activer/Désactiver (bloque login)
✅ BF6 - Statistiques système
✅ Export PDF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // CONTEXTE CEO + MANAGER (Données financières)
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      if (currentUser.role === 'CEO' || currentUser.role === 'Manager') {
        
        // 📊 RÉCUPÉRER TOUTES LES DONNÉES FINANCIÈRES
        const expenses = await this.prisma.expense.findMany({
          where: { userId },
          include: { transactionLines: { include: { category: true } } },
        });

        const invoices = await this.prisma.invoice.findMany({
          where: { userId },
        });

        const payments = await this.prisma.payment.findMany({
          include: { invoice: true },
        });

        // 💰 CALCULS KPIs
        const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
        const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
        const totalAR = invoices.reduce((sum, inv) => sum + Number(inv.balance), 0);
        const unpaidInvoicesCount = invoices.filter(inv => Number(inv.balance) > 0).length;

        const oldestExpense = expenses.sort((a, b) => 
          new Date(a.expenseDate).getTime() - new Date(b.expenseDate).getTime()
        )[0];
        
        const monthsElapsed = oldestExpense 
          ? Math.max(1, this.getMonthsDiff(new Date(oldestExpense.expenseDate), new Date()))
          : 1;

        const burnRate = totalExpenses / monthsElapsed;
        const monthlyRevenue = totalRevenue / monthsElapsed;
        const quickRatio = burnRate > 0 ? (monthlyRevenue / burnRate) : 0;
        const currentCash = totalRevenue - totalExpenses;
        const runway = burnRate > 0 ? (currentCash / burnRate) : 0;

        context += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 KPIs FINANCIERS (DONNÉES RÉELLES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 BURN RATE : ${Math.round(burnRate)} TND/mois
   (Dépenses mensuelles moyennes)
   
⚡ QUICK RATIO : ${quickRatio.toFixed(2)}
   ${quickRatio > 1 ? '✅ Profitable (gagne plus que dépense)' : quickRatio === 1 ? '⚠️ Point mort' : '❌ Déficit'}
   
🛫 RUNWAY : ${Math.round(runway)} mois
   (Temps avant rupture de trésorerie)
   
💳 TOTAL AR : ${Math.round(totalAR)} TND
   (${unpaidInvoicesCount} factures impayées)
   
📊 REVENUS MENSUELS : ${Math.round(monthlyRevenue)} TND/mois

📉 TOTAL DÉPENSES : ${Math.round(totalExpenses)} TND
   
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 AR AGING (FACTURES IMPAYÉES PAR TRANCHE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        // 📊 AR AGING
        const now = new Date();
        const aging = {
          '0-30j': { count: 0, total: 0 },
          '31-60j': { count: 0, total: 0 },
          '61-90j': { count: 0, total: 0 },
          '+90j': { count: 0, total: 0 },
        };

        invoices.forEach(inv => {
          const balance = Number(inv.balance);
          if (balance > 0 && inv.dueDate) {
            const daysLate = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));
            
            if (daysLate <= 30) {
              aging['0-30j'].count++;
              aging['0-30j'].total += balance;
            } else if (daysLate <= 60) {
              aging['31-60j'].count++;
              aging['31-60j'].total += balance;
            } else if (daysLate <= 90) {
              aging['61-90j'].count++;
              aging['61-90j'].total += balance;
            } else {
              aging['+90j'].count++;
              aging['+90j'].total += balance;
            }
          }
        });

        context += `
📅 0-30 jours : ${aging['0-30j'].count} factures, ${Math.round(aging['0-30j'].total)} TND
📅 31-60 jours : ${aging['31-60j'].count} factures, ${Math.round(aging['31-60j'].total)} TND (⚠️ Attention requise)
📅 61-90 jours : ${aging['61-90j'].count} factures, ${Math.round(aging['61-90j'].total)} TND (🔴 Priorité relance)
📅 +90 jours : ${aging['+90j'].count} factures, ${Math.round(aging['+90j'].total)} TND (🚨 CRITIQUE)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📉 DÉPENSES PAR CATÉGORIE (CATEGORY MARGINS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        // 📉 CATEGORY MARGINS
        const categoryTotals: Record<string, number> = {};
        
        expenses.forEach(exp => {
          exp.transactionLines.forEach(line => {
            const catName = line.category.name;
            categoryTotals[catName] = (categoryTotals[catName] || 0) + Number(line.amount);
          });
        });

        Object.entries(categoryTotals)
          .sort(([, a], [, b]) => b - a)
          .forEach(([category, amount]) => {
            const percentage = totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(1) : 0;
            context += `
📦 ${category} : ${Math.round(amount)} TND (${percentage}%)`;
          });

        context += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 BURN VS EARN (REVENUS VS DÉPENSES PAR MOIS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        // 📈 BURN VS EARN
        const monthlyData: Record<string, { burn: number; earn: number }> = {};

        expenses.forEach(exp => {
          const monthKey = this.getMonthKey(new Date(exp.expenseDate));
          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { burn: 0, earn: 0 };
          }
          monthlyData[monthKey].burn += Number(exp.amount);
        });

        invoices.forEach(inv => {
          const monthKey = this.getMonthKey(new Date(inv.issueDate));
          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { burn: 0, earn: 0 };
          }
          monthlyData[monthKey].earn += Number(inv.totalAmount);
        });

        Object.entries(monthlyData)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([month, data]) => {
            const profit = data.earn - data.burn;
            const status = profit > 0 ? '✅ Profit' : profit === 0 ? '⚖️ Équilibre' : '❌ Perte';
            context += `
📅 ${month} : Revenus ${Math.round(data.earn)} TND | Dépenses ${Math.round(data.burn)} TND | ${status} ${Math.round(profit)} TND`;
          });

        context += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        // CONTEXTE SPÉCIFIQUE MANAGER
        if (currentUser.role === 'Manager') {
          context += `
📋 DASHBOARD MANAGER - ACTIONS DISPONIBLES :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ AR Aging détaillé (ci-dessus)
✅ Suivi dépenses par catégorie (ci-dessus)
✅ Synchronisation QuickBooks manuelle (bouton "Sync Now")
✅ Relance clients pour factures en retard

⚠️ PRIORITÉS MANAGER :
- ${aging['61-90j'].count + aging['+90j'].count} factures nécessitent une relance urgente
- Catégorie principale : ${Object.entries(categoryTotals).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        }

        // CONTEXTE SPÉCIFIQUE CEO
        if (currentUser.role === 'CEO') {
          context += `
📋 DASHBOARD CEO - VISION STRATÉGIQUE :
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Vue complète KPIs financiers (ci-dessus)
✅ Graphiques Burn vs Earn (ci-dessus)
✅ AR Aging global (ci-dessus)
✅ Category Margins (ci-dessus)
✅ Export PDF rapports

💡 INSIGHTS STRATÉGIQUES :
- Quick Ratio ${quickRatio.toFixed(2)} ${quickRatio > 1.5 ? '(Excellente santé)' : quickRatio > 1 ? '(Bonne santé)' : '(Amélioration nécessaire)'}
- Runway ${Math.round(runway)} mois ${runway > 12 ? '(Très confortable)' : runway > 6 ? '(Correct)' : '(⚠️ Attention requise)'}
- ${unpaidInvoicesCount} factures impayées = ${Math.round(totalAR)} TND à récupérer
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
        }
      }

      return context;

    } catch (error) {
      console.error('Erreur récupération contexte dashboard:', error);
      return '';
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CHAT PRINCIPAL
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async chat(message: string, userId: string): Promise<string> {
    try {
      const dashboardContext = await this.getDashboardContext(userId);

      let history = this.conversationHistory.get(userId) || [];

      if (history.length > 15) {
        history = history.slice(-15);
      }

      history.push({
        role: 'user',
        content: message,
      });

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Tu es un assistant virtuel intelligent et professionnel nommé "Assistant Agri-FinOps".

🎯 TU ES UN ASSISTANT UNIVERSEL - TU PEUX RÉPONDRE À TOUTES LES QUESTIONS

📊 SPÉCIALITÉ : Agri-FinOps - Plateforme BI QuickBooks pour startups agri-food

${dashboardContext ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 CONTEXTE CRITIQUE : DASHBOARD EN TEMPS RÉEL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${dashboardContext}

⚠️ RÈGLES IMPORTANTES :
- Utilise TOUJOURS ces données RÉELLES pour répondre
- Si on te demande des chiffres, cite les valeurs exactes ci-dessus
- Sois précis, utilise les VRAIES données, pas des exemples
- Explique les KPIs de manière simple et actionnaire
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📚 CONNAISSANCES GÉNÉRALES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔹 BURN RATE : Dépenses mensuelles moyennes (Total dépenses / Mois)
🔹 QUICK RATIO : Revenus mensuels / Dépenses mensuelles (> 1 = profitable)
🔹 RUNWAY : Trésorerie / Burn Rate (mois avant rupture)
🔹 AR AGING : Factures impayées par ancienneté (0-30j, 31-60j, 61-90j, +90j)
🔹 CATEGORY MARGINS : Dépenses par catégorie (Logistique, Inventaire, RH, Marketing, Opérations)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📱 STYLE DE RÉPONSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Clair et concis (2-4 phrases pour questions simples)
✅ Utilise les VRAIES données du contexte ci-dessus
✅ Émojis pour clarifier (📊 💰 ✅ ⚠️)
✅ Professionnel mais accessible
✅ Toujours en français

⚠️ RÈGLE D'OR :
Si question dashboard → Utilise données RÉELLES ci-dessus
Si question générale → Réponds comme ChatGPT universel
`,
          },
          ...history,
        ],
        max_tokens: 1000,
        temperature: 0.7,
      });

      const response = completion.choices[0].message.content || 'Désolé, je n\'ai pas pu générer une réponse.';

      history.push({
        role: 'assistant',
        content: response,
      });

      this.conversationHistory.set(userId, history);

      return response;

    } catch (error: any) {
      console.error('Erreur OpenAI:', error.message);
      return this.getIntelligentFallback(message, userId);
    }
  }

  clearHistory(userId: string): void {
    this.conversationHistory.delete(userId);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // HELPERS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private getMonthsDiff(start: Date, end: Date): number {
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  }

  private getMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private async getIntelligentFallback(question: string, userId: string): Promise<string> {
    const q = question.toLowerCase();

    const dashboardContext = await this.getDashboardContext(userId);

    if (q.includes('burn rate') && dashboardContext) {
      const match = dashboardContext.match(/BURN RATE : (\d+) TND\/mois/);
      if (match) {
        return `🔥 Ton **Burn Rate actuel** est de **${match[1]} TND/mois**. C'est le montant moyen que tu dépenses chaque mois. ${parseInt(match[1]) > 10000 ? '⚠️ Assez élevé, surveille tes dépenses.' : '✅ Raisonnable.'}`;
      }
    }

    if (q.includes('quick ratio') && dashboardContext) {
      const match = dashboardContext.match(/QUICK RATIO : ([\d.]+)/);
      if (match) {
        const ratio = parseFloat(match[1]);
        return `⚡ Ton **Quick Ratio** est de **${ratio}**. ${ratio > 1 ? '✅ Tu es profitable (tu gagnes plus que tu dépenses) !' : ratio === 1 ? '⚖️ Tu es au point mort.' : '❌ Attention, tu dépenses plus que tu gagnes.'}`;
      }
    }

    if (q.includes('runway') && dashboardContext) {
      const match = dashboardContext.match(/RUNWAY : (\d+) mois/);
      if (match) {
        const months = parseInt(match[1]);
        return `🛫 Ton **Runway** est de **${months} mois**. ${months > 12 ? '✅ Excellent ! Tu as plus d\'un an de trésorerie.' : months > 6 ? '👍 Correct, surveille quand même.' : '⚠️ Attention, moins de 6 mois restants !'}`;
      }
    }

    return "Je suis l'assistant Agri-FinOps. Je peux t'aider avec ton Dashboard (KPIs réels, graphiques, analyses), QuickBooks, et toutes questions générales. Que veux-tu savoir ? 🚀";
  }
}
