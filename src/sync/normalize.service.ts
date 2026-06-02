import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NormalizeService {
  constructor(private prisma: PrismaService) { }

  async normalizeAll(userId: string) {
    //Normalise les factures de cet utilisateur
    const invoicesResult = await this.normalizeInvoices(userId);
    const expensesResult = await this.normalizeExpenses(userId);
    const categoriesResult = await this.recategorizeTransactionLines();

    return {
      invoices: invoicesResult,
      expenses: expensesResult,
      categories: categoriesResult,
    };

  }
  //Cette fonction parcourt les factures d’un utilisateur, corrige les données manquantes comme le nom ou la date d’échéance, calcule automatiquement le statut de la facture, puis met à jour la base de données.
  async normalizeInvoices(userId: string) {
    //On récupère toutes les factures de l’utilisateur
    const invoices = await this.prisma.invoice.findMany({
      where: { userId },
    });
   //Compteur des factures corrigées
    let fixed = 0;
   //On parcourt chaque facture.
    for (const inv of invoices) {
      //updates va contenir seulement les champs à corriger
      const updates: any = {};
      
     //Si le nom du client est manquant ou vide, on le remplace par "Unknown Customer"
      if (!inv.customerName || inv.customerName.trim() === '') {
        updates.customerName = 'Unknown Customer';
      }
    //Si la date d’échéance =dueDate=date limite pour payer facture) est manquante, on la fixe à 30 jours après la date de création()(issue Date) de la facture.
      if (!inv.dueDate) {
        const due = new Date(inv.issueDate); // on prend la date de création de la facture et on le transforme en objet date
        due.setDate(due.getDate() + 30); // setDate():on modifie la date ; due.getDate() = jour actuel de la date
        updates.dueDate = due; //updates = objet qui contient les corrections on met la nouvelle date dedans
      }

    
      const dueDate = inv.dueDate || updates.dueDate;
      //balance veut dire le montant restant à payer 
      const balance = Number(inv.balance);

      if (balance === 0) {
        updates.status = 'PAID';
      } else if (dueDate && new Date(dueDate) < new Date()) {
        updates.status = 'OVERDUE';
      } else {
        updates.status = 'UNPAID';
      }

      //updates est un objet qui contient les champs à modifier.
      // Object.keys(updates) retourne les champs modifiés
      // Si la taille > 0, cela signifie qu’au moins une correction a été faite
      if (Object.keys(updates).length > 0) {

        // Met à jour la facture dans la base de données
        // "where" permet de trouver la facture par son id
        // "data" contient les nouvelles valeurs corrigées
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: updates,
        });

        // Incrémente le compteur de factures corrigées
        fixed++;
      }
      //il y a au moins une correction ?
      if (Object.keys(updates).length > 0) {
        await this.prisma.invoice.update({
          where: { id: inv.id },
          data: updates,
        });
        fixed++;
      }
    }

    return { message: 'Invoices normalisées', fixed };
  }

  async normalizeExpenses(userId: string) {
    // récupère de la base toutes les dépenses de cet utilisateur.
    const expenses = await this.prisma.expense.findMany({
      where: { userId },
    });
   //compte combien de dépenses ont été corrigées.
    let fixed = 0;
    //updates est un objet (liste)( au debut elle est vide) qui contient les champs à modifier.

    for (const exp of expenses) {
      const updates: any = {};

       //Si la dépense n’a pas de description, mets "Expense" comme description
       //trim :la description existe, mais elle est vide ou contient seulement des espaces.
      if (!exp.description || exp.description.trim() === '') {
        updates.description = 'Expense';
      }
        //Si le nom du fournisseur est manquant, mets "Unknown" comme nom du fournisseur
        

      if (!exp.vendorName || exp.vendorName.trim() === '') {
        updates.vendorName = 'Unknown';
      }
        // au moins une correction à faire ?
      if (Object.keys(updates).length > 0) {
        await this.prisma.expense.update({
          where: { id: exp.id },
          data: updates,
        });
        fixed++;
      }
    }

    return { message: ' Expenses normalisées', fixed };
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

    return { message: ' TransactionLines recatégorisées', recategorized };
  }

 // Fonction qui transforme une catégorie brute (texte) en catégorie standardisée
private categorize(rawCategory: string): string {

  // Met le texte en minuscule pour faciliter les comparaisons
  const lower = rawCategory.toLowerCase();

  // Si le texte contient des mots liés au transport ou carburant
  if (lower.includes('fuel') || lower.includes('transport') ||
      lower.includes('shipping') || lower.includes('automobile') ||
      lower.includes('vehicle') || lower.includes('gas') ||
      lower.includes('delivery') || lower.includes('freight'))
    return 'Logistics: Fuel & Transport';

  // Si le texte contient des mots liés aux stocks ou matériaux
  if (lower.includes('dairy') || lower.includes('meat') ||
      lower.includes('produce') || lower.includes('inventory') ||
      lower.includes('material') || lower.includes('equipment rental') ||
      lower.includes('supplies'))
    return 'Inventory: Supplies & Materials';

  // Si le texte contient des mots liés aux salaires ou employés
  if (lower.includes('salary') || lower.includes('payroll') ||
      lower.includes('wage') || lower.includes('job expenses') ||
      lower.includes('labor') || lower.includes('staff'))
    return 'Labor: Salaries & Job Expenses';
    
  

  // Si le texte contient des mots liés aux charges (loyer, électricité, etc.)
  if (lower.includes('rent') || lower.includes('utilities') ||
      lower.includes('electricity') || lower.includes('maintenance') ||
      lower.includes('repair') || lower.includes('landscaping') ||
      lower.includes('sprinkler') || lower.includes('fountain') ||
      lower.includes('cleaning') || lower.includes('office'))
    return 'Operations: Overhead';
    

  // Si le texte contient des mots liés au marketing
  if (lower.includes('marketing') || lower.includes('advertising') ||
      lower.includes('promotion') || lower.includes('consulting'))
    return 'Marketing & Sales';

  // Si le texte contient des mots liés aux repas ou divertissement
  if (lower.includes('meals') || lower.includes('entertainment') ||
      lower.includes('lunch') || lower.includes('dinner') ||
      lower.includes('restaurant'))
    return 'Meals & Entertainment';

  // Si le texte contient des mots liés au juridique ou comptabilité
  if (lower.includes('legal') || lower.includes('professional') ||
      lower.includes('accounting') || lower.includes('lawyer'))
    return 'Legal & Professional Fees';

  // Si aucune condition ne correspond, on retourne "Other"
  return 'Other';
  
}
}