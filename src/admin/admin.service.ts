import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF1 : Liste utilisateurs avec company
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async getAllUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: true,  
        isActive: true,
        createdAt: true,
        _count: {
          select: {
            invoices: true,
            expenses: true,
          },
        },
      },
      //Les utilisateurs sont triés du plus récent au plus ancien.
      orderBy: { createdAt: 'desc' },
    });
   //On transforme chaque utilisateur avant de le retourner.
    return users.map(user => ({
      ...user,
      invoiceCount: user._count.invoices,
      expenseCount: user._count.expenses,
    }));
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF2 : Créer utilisateur avec company
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async createUser(
    name: string,
    email: string,
    password: string,
    role: string,
    company: string,  
  ) {
    // Vérifier email unique
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ForbiddenException('Email déjà utilisé');
    }

    // Vérifier si un Admin existe déjà
    if (role === 'Admin') {
      const adminExists = await this.prisma.user.findFirst({
        where: { role: 'Admin' },
      });

      if (adminExists) {
        throw new ForbiddenException('❌ Un administrateur existe déjà.');
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    //On crée l’utilisateur dans la base de données.
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        company,  
        isActive: true,
        
      },
    });

    const { password: _, ...result } = user;
    return result;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF3 : Modifier utilisateur avec company
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async updateUser(
    userId: string,
    name?: string,
    email?: string,
    role?: string,
    company?: string,  
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Si on essaie de donner le rôle Admin à quelqu’un qui ne l’était pas déjà,
    //  on vérifie s’il existe déjà un autre admin.
    if (role === 'Admin' && user.role !== 'Admin') {
      const adminExists = await this.prisma.user.findFirst({
        where: { role: 'Admin', id: { not: userId } },
      });

      if (adminExists) {
        throw new ForbiddenException('❌ Un administrateur existe déjà.');
      }
    }

    // Update avec company
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
        ...(role && { role }),
        ...(company && { company }),  
      },
    });
    //On enlève le mot de passe avant de retourner l’utilisateur cree.

    const { password: _, ...result } = updatedUser;
    return result;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF4 : Supprimer utilisateur
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.role === 'Admin') {
      throw new ForbiddenException('❌ Impossible de supprimer l\'Admin.');
    }
//On supprime l’utilisateur de la base de données.
    await this.prisma.user.delete({ where: { id: userId } });

    return { message: 'Utilisateur supprimé' };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF5 : Toggle status
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //Méthode pour changer le statut actif/inactif d’un utilisateur.
  async toggleUserStatus(userId: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.role === 'Admin' && !isActive) {
      throw new ForbiddenException('❌ Impossible de désactiver l\'Admin.');
    }
   //On met à jour uniquement le champ isActive.
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });

    return updatedUser;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // BF6 : Statistiques avec filtrage par company
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async getSystemStats(company?: string) {
    // Filtre par company si fourni
    const whereClause = company ? { company } : {};

    const totalUsers = await this.prisma.user.count({ where: whereClause });
    
    const activeUsers = await this.prisma.user.count({
      where: { ...whereClause, isActive: true },
    });
    
    const inactiveUsers = totalUsers - activeUsers;

    const ceoCount = await this.prisma.user.count({
      where: { ...whereClause, role: 'CEO' },
    });
    
    const managerCount = await this.prisma.user.count({
      where: { ...whereClause, role: 'Manager' },
    });
    
    const adminCount = await this.prisma.user.count({
      where: { ...whereClause, role: 'Admin' },
    });

    // Stats par company
    const s1Count = await this.prisma.user.count({ where: { company: 'S1' } });
    const s2Count = await this.prisma.user.count({ where: { company: 'S2' } });
   
    //Compte les connexions QuickBooks actives.
    //gt veut dire “greater than”, donc supérieur à.
    //Ici, on compte les tokens dont expiresAt est plus grand que la date actuelle.
    const activeQBConnections = await this.prisma.oAuthToken.count({
      where: {
        expiresAt: { gt: new Date() },
      },
    });

    const totalInvoices = await this.prisma.invoice.count();
    const totalExpenses = await this.prisma.expense.count();
    const totalPayments = await this.prisma.payment.count();

    return {
      totalUsers,
      activeUsers,
      inactiveUsers,
      ceoCount,
      managerCount,
      adminCount,
      s1Count,  
      s2Count,  
      activeQBConnections,
      totalInvoices,
      totalExpenses,
      totalPayments,
    };
  }
}