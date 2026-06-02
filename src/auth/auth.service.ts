import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { MailerService } from '@nestjs-modules/mailer'; 
import { validate } from 'deep-email-validator';


// 1. VALIDATION EMAIL RÉEL (domaine + jetable + MX)
// 2. SIGNUP AVEC EMAIL DE BIENVENUE

@Injectable()
export class AuthService {
  constructor(
    
    private prisma: PrismaService, 
    private jwtService: JwtService,
        private mailerService: MailerService, 

  ) {} 
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VALIDATION EMAIL RÉEL (domaine + jetable + MX)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  private async validateEmailExists(email: string): Promise<void> {
    // 1. Format basique
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('❌ Format d\'email invalide. Ex: nom@domaine.com');
    }
 
    // 2. Domaines jetables / fake connus
    const fakeDomains = [
      'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
      'fakeinbox.com', 'trashmail.com', 'yopmail.com', 'sharklasers.com',
      'guerrillamail.info', 'spam4.me', 'temp-mail.org', 'dispostable.com',
      'maildrop.cc', 'mailnull.com', 'trashmail.me', 'discard.email',
      'spambox.us', 'spamgourmet.com', 'grr.la', 'fakeemail.com',
      'example.com', 'test.com', 'fake.com', 'noreply.com',
    ];
 
    const domain = email.split('@')[1].toLowerCase();
    if (fakeDomains.includes(domain)) {
      throw new BadRequestException(
        `❌ L'adresse "${email}" n'est pas acceptée. Veuillez utiliser une vraie adresse email (Gmail, Outlook, etc.).`
      );
    }
 
    // 3. Vérification approfondie (MX record + jetable)
    try {
      
      const result = await validate({
        email,
        sender: email,
        validateRegex: true,
        validateMx: true,
        validateTypo: false,
        validateDisposable: true,
        validateSMTP: false,
      });
 
      if (!result.valid) {
        const reason = result.reason;
        if (reason === 'mx') {
          throw new BadRequestException(
            `❌ Le domaine "@${domain}" n'existe pas ou ne peut pas recevoir d'emails. Vérifiez votre adresse.`
          );
        }
        if (reason === 'disposable') {
          throw new BadRequestException(
            '❌ Les adresses email temporaires ne sont pas acceptées. Utilisez votre vraie adresse email.'
          );
        }
        if (reason === 'regex') {
          throw new BadRequestException('❌ Format d\'email invalide.');
        }
        throw new BadRequestException(
          `❌ L'adresse email "${email}" est invalide. Utilisez une vraie adresse email.`
        );
      }
    } catch (error:any) {
      if (error instanceof BadRequestException) throw error;
      // Erreur réseau → on laisse passer (ne bloque pas l'inscription)
      console.warn('⚠️ Validation email non concluante:', error.message);
    }
  }
 
  
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SIGNUP AVEC EMAIL DE BIENVENUE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async signup(name: string, email: string, password: string, role: string, dateOfBirth: Date ) {
    // 1.  Valider que l'email est réel (BLOQUE si fake)
    await this.validateEmailExists(email);
    // 1️ Vérifier si email existe déjà
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new UnauthorizedException('Cet email est déjà utilisé');
    }

    //  Hacher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    //  Créer l'utilisateur
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        dateOfBirth,
        role,
        isActive: true,
  
      },
    });

    // 4️⃣ Générer le token JWT
    const payload = { email: user.email, sub: user.id, role: user.role };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ✅ ENVOYER EMAIL DE BIENVENUE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: '🎉 Bienvenue sur Agri-FinOps !',
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenue sur Agri-FinOps</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4;">
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 20px;">
    <tr>
      <td align="center">
        
        <!-- Container principal -->
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          
          <!-- Header avec gradient vert -->
          <tr>
            <td style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold;">
                🌾 Bienvenue sur Agri-FinOps !
              </h1>
              <p style="color: #d1fae5; margin: 10px 0 0 0; font-size: 14px;">
                Votre plateforme de gestion financière intelligente
              </p>
            </td>
          </tr>

          <!-- Corps du message -->
          <tr>
            <td style="padding: 40px 30px;">
              
              <!-- Salutation personnalisée -->
              <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 22px;">
                Bonjour <strong style="color: #16a34a;">${name}</strong> 👋
              </h2>

              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0; font-size: 15px;">
                Félicitations ! Votre compte <strong>Agri-FinOps</strong> a été créé avec succès.
              </p>

              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 30px 0; font-size: 15px;">
                Vous êtes maintenant prêt à optimiser la gestion financière de votre entreprise agri-food avec notre plateforme intelligente.
              </p>

              <!-- Informations du compte -->
              <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; margin-bottom: 30px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      📋 Informations de votre compte
                    </p>
                    <p style="margin: 0 0 8px 0; color: #1f2937; font-size: 15px;">
                      <strong>Email :</strong> ${email}
                    </p>
                    <p style="margin: 0; color: #1f2937; font-size: 15px;">
                      <strong>Rôle :</strong> <span style="background-color: #dcfce7; color: #15803d; padding: 4px 12px; border-radius: 12px; font-weight: 600; font-size: 13px;">${role}</span>
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Ce que vous pouvez faire -->
              <h3 style="color: #1f2937; margin: 0 0 15px 0; font-size: 18px;">
                🚀 Ce que vous pouvez faire maintenant :
              </h3>

              <ul style="color: #4b5563; line-height: 1.8; margin: 0 0 30px 0; padding-left: 20px; font-size: 15px;">
                <li><strong>Connecter QuickBooks</strong> pour synchroniser vos données comptables</li>
                <li><strong>Consulter vos KPIs financiers</strong> (Burn Rate, Quick Ratio, Runway)</li>
                <li><strong>Analyser vos dépenses</strong> par catégorie automatiquement</li>
                <li><strong>Suivre vos factures impayées</strong> avec AR Aging</li>
                <li><strong>Exporter des rapports PDF</strong> professionnels</li>
              </ul>

              <!-- Bouton d'action -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="http://localhost:3000/login" style="background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px rgba(22, 163, 74, 0.3);">
                      🔐 Se connecter maintenant
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Besoin d'aide -->
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; border-radius: 6px; margin-top: 30px;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  💡 <strong>Besoin d'aide ?</strong><br>
                  Notre assistant IA intégré est disponible 24/7 pour répondre à vos questions sur la plateforme.
                </p>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; margin: 0 0 10px 0; font-size: 13px;">
                Merci d'avoir choisi <strong style="color: #16a34a;">Agri-FinOps</strong>
              </p>
              <p style="color: #9ca3af; margin: 0; font-size: 12px;">
                © ${new Date().getFullYear()} Agri-FinOps - Plateforme BI pour startups agri-food
              </p>
              <p style="color: #9ca3af; margin: 10px 0 0 0; font-size: 11px;">
                Cet email a été envoyé à ${email}
              </p>
            </td>
          </tr>

        </table>
        
      </td>
    </tr>
  </table>

</body>
</html>
        `,
      });

      console.log(`✅ Email de bienvenue envoyé à ${email}`);
    } catch (emailError) {
      console.error('❌ Erreur envoi email:', emailError);
      // On ne bloque pas l'inscription si l'email échoue
    }

    // 5️⃣ Retourner le token + user
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }
    };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // VALIDATE USER (avec vérification isActive)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('🔒 Votre compte a été désactivé par l\'administrateur.');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    const { password: _, ...result } = user;
    return result;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LOGIN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async login(user: any) {
    const payload = { email: user.email, sub: user.id, role: user.role };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        dateOfBirth: user.dateOfBirth,
      },
    };
  }


}