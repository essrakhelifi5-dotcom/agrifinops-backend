import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordResetService {
  private transporter: nodemailer.Transporter;

  constructor(private prisma: PrismaService) {
    // Crée la configuration d’envoi email avec Nodemailer
    this.transporter = nodemailer.createTransport({
      //Utilise MAIL_HOST depuis .env,Si absent, il utilise Gmail SMTP par défault
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });
  }

  // ─────────────────────────────────────────────
  // ÉTAPE 1-4 : Demande de réinitialisation + Envoi du code
  // ─────────────────────────────────────────────
  async requestPasswordReset(email: string) {
    // Vérifie que l'utilisateur existe
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new NotFoundException('❌ Aucun compte trouvé avec cet email');
    }

    // Génère un code à 6 chiffres
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Expire dans 15 minutes
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Sauvegarde le code dans la DB
    await this.prisma.passwordReset.create({
      data: {
        email,
        code,
        expiresAt,
      },
    });

    // Envoie l'email
    await this.sendResetEmail(email, code, user.name);

    return {
      message: '✅ Un code de réinitialisation a été envoyé à votre email',
      email, // Pour le frontend
    };
  }

  // ─────────────────────────────────────────────
  // ÉTAPE 5 : Vérification du code
  // ─────────────────────────────────────────────
  async verifyResetCode(email: string, code: string) {
    const resetRequest = await this.prisma.passwordReset.findFirst({
      where: {
        email,
        code,
        used: false,
        expiresAt: {
          gt: new Date(), // Code non expiré
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetRequest) {
      throw new BadRequestException('❌ Code invalide ou expiré');
    }

    return {
      message: '✅ Code vérifié avec succès',
      resetId: resetRequest.id,
    };
  }

  // ─────────────────────────────────────────────
  // ÉTAPE 6-7 : Changement du mot de passe
  // ─────────────────────────────────────────────
  async resetPassword(email: string, code: string, newPassword: string) {
    // Vérifie le code une dernière fois
    const resetRequest = await this.prisma.passwordReset.findFirst({
      where: {
        email,
        code,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!resetRequest) {
      throw new BadRequestException('❌ Code invalide ou expiré');
    }

    // Validation du mot de passe
    if (newPassword.length < 6) {
      throw new BadRequestException('❌ Le mot de passe doit contenir au moins 6 caractères');
    }

    // Hash le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Met à jour le mot de passe
    await this.prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    // Marque le code comme utilisé
    await this.prisma.passwordReset.update({
      where: { id: resetRequest.id },
      data: { used: true },
    });

    return {
      message: '✅ Mot de passe réinitialisé avec succès',
    };
  }

  // ─────────────────────────────────────────────
  // Envoi de l'email
  // ─────────────────────────────────────────────
  private async sendResetEmail(email: string, code: string, name: string) {
    const mailOptions = {
      from: process.env.MAIL_FROM || 'Agri-FinOps <noreply@agrifinops.com>',
      to: email,
      subject: '🔐 Réinitialisation de votre mot de passe Agri-FinOps',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; }
            .container { background-color: white; padding: 30px; border-radius: 10px; max-width: 600px; margin: 0 auto; }
            .header { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
            .code { font-size: 32px; font-weight: bold; color: #16a34a; text-align: center; padding: 20px; background-color: #f0fdf4; border-radius: 8px; margin: 20px 0; letter-spacing: 5px; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Réinitialisation de mot de passe</h1>
            </div>
            <p>Bonjour <strong>${name}</strong>,</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe Agri-FinOps.</p>
            <p>Voici votre code de vérification :</p>
            <div class="code">${code}</div>
            <p><strong>⏰ Ce code expire dans 15 minutes.</strong></p>
            <p>Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
            <div class="footer">
              <p>© 2026 Agri-FinOps - B264 Dashboard</p>
              <p>Cet email a été envoyé automatiquement, merci de ne pas y répondre.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }
}