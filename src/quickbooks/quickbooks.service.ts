import { Injectable } from '@nestjs/common';
//ConfigService sert à lire les variables dans .env.
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
//axios sert à envoyer des requêtes HTTP vers QuickBooks.
import axios from 'axios';
//qs sert à transformer un objet en format formulaire
import * as qs from 'qs';

@Injectable()
export class QuickbooksService {
  // Stockage temporaire des states OAuth
  private stateStore = new Map<string, Date>();

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  // ─────────────────────────────────────────────
  // ÉTAPE 1 : Générer l'URL d'autorisation OAuth
  // ─────────────────────────────────────────────
  //Cette méthode reçoit l’id utilisateur et retourne un lien QuickBooks.
  getAuthorizationUrl(userId: string): string {
    const clientId = this.configService.get<string>('QB_CLIENT_ID');
    const redirectUri = this.configService.get<string>('QB_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new Error('Missing QuickBooks environment variables');
    }

    //crée un state
    const state = `${userId}_${Math.random().toString(36).substring(2)}`;
    //On sauvegarde ce state pendant 10 minutes
    this.stateStore.set(state, new Date(Date.now() + 10 * 60 * 1000));

    //On prépare les paramètres de l’URL QuickBooks
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: redirectUri,
      state: state,
    });
    //On retourne le lien final vers QuickBooks.
    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  }

  // ─────────────────────────────────────────────
  // ÉTAPE 2 : Échanger le code contre un access token
  // ─────────────────────────────────────────────
  //Cette méthode est appelée quand QuickBooks revient vers ton backend.
  async exchangeCode(code: string, realmId: string, state: string, userId: string) {
    //On vérifie que le state existe
    if (!this.stateStore.has(state)) {
      throw new Error('Invalid or expired state parameter');
    }
    //On supprime le state après utilisation.
    this.stateStore.delete(state);
    // lire les variables QuickBooks depuis .env.
    const clientId = this.configService.get<string>('QB_CLIENT_ID');
    const clientSecret = this.configService.get<string>('QB_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('QB_REDIRECT_URI');

    //On crée une authentification Basic pour QuickBooks.
     const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    //On envoie une requête à QuickBooks pour échanger le code contre des tokens.
     const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      qs.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
//On calcule la date d’expiration du token.
    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Sauvegarde ou mise à jour du token en DB
    const existingToken = await this.prisma.oAuthToken.findUnique({
      where: { userId },
    });

    if (existingToken) {
      await this.prisma.oAuthToken.update({
        where: { userId },
        data: { accessToken: access_token, refreshToken: refresh_token, expiresAt, realmId },
      });
    } else {
      await this.prisma.oAuthToken.create({
        data: { accessToken: access_token, refreshToken: refresh_token, expiresAt, realmId, userId },
      });
    }

    return {
      message: ' QuickBooks connected successfully and tokens saved!',
      realmId,
      expiresAt,
    };
  }

  // ─────────────────────────────────────────────
  // Refresh le token QuickBooks automatiquement
  // Appelé quand le access token est expiré
  // ─────────────────────────────────────────────
  private async refreshAccessToken(userId: string) {
    //On récupère le token actuel  de user  depuis la DB
    const tokenData = await this.prisma.oAuthToken.findUnique({
      where: { userId },
    });

    if (!tokenData) throw new Error('Non connecté à QuickBooks.');

    const clientId = this.configService.get<string>('QB_CLIENT_ID');
    const clientSecret = this.configService.get<string>('QB_CLIENT_SECRET');
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    // Appel QuickBooks pour obtenir un nouveau access token
    const response = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      qs.stringify({
        grant_type: 'refresh_token',
        refresh_token: tokenData.refreshToken,
      }),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Met à jour le token en DB
    await this.prisma.oAuthToken.update({
      where: { userId },
      data: { accessToken: access_token, refreshToken: refresh_token, expiresAt },
    });

    console.log(' Token QuickBooks rafraîchi avec succès');
    return { ...tokenData, accessToken: access_token, expiresAt };
  }

  // ─────────────────────────────────────────────
  // Récupère le token valide — refresh automatique si expiré
  // Utilisée par toutes les méthodes qui appellent QuickBooks
  // ─────────────────────────────────────────────
  private async getValidToken(userId: string) {
    //Elle cherche le token en base
    const tokenData = await this.prisma.oAuthToken.findUnique({
      where: { userId },
    });
   //Si aucun token, erreur
    if (!tokenData) {
      throw new Error('Non connecté à QuickBooks. Veuillez vous connecter d\'abord.');
    }

    // Si le token est expiré → refresh automatique
    if (new Date() > tokenData.expiresAt) {
      console.log(' Token expiré — refresh automatique...');
      return await this.refreshAccessToken(userId);
    }

    return tokenData;
  }

  // ─────────────────────────────────────────────
  // DONNÉES 1 : Informations de l'entreprise
  // ─────────────────────────────────────────────
  async getCompanyInfo(userId: string) {
    //il faut un token valide.
    const tokenData = await this.getValidToken(userId);
    //On construit l’URL QuickBooks

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/companyinfo/${tokenData.realmId}`;

    const response = await axios.get(url, {
      headers: {
        // On envoie le token dans le header.
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
      },
    });

    // Retourne uniquement CompanyInfo
    return response.data.CompanyInfo;
  }

  // ─────────────────────────────────────────────
  // DONNÉES 2 : Liste des factures
  // ─────────────────────────────────────────────
  async getInvoices(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/query?query=SELECT * FROM Invoice MAXRESULTS 20&minorversion=65`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
      },
    });

    return response.data.QueryResponse.Invoice || [];
  }

  // ─────────────────────────────────────────────
  // DONNÉES 3 : Liste des clients
  // ─────────────────────────────────────────────
  async getCustomers(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/query?query=SELECT * FROM Customer MAXRESULTS 20&minorversion=65`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
      },
    });

    return response.data.QueryResponse.Customer || [];
  }

  // ─────────────────────────────────────────────
  // DONNÉES 4 : Rapport Profit & Loss
  // ─────────────────────────────────────────────
  async getProfitAndLoss(userId: string) {
    const tokenData = await this.getValidToken(userId);

    const url = `https://sandbox-quickbooks.api.intuit.com/v3/company/${tokenData.realmId}/reports/ProfitAndLoss?minorversion=65`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        Accept: 'application/json',
      },
    });

    return response.data;
  }




// ── Méthode publique pour refresh depuis SyncService ──
async refreshTokenIfNeeded(userId: string) {
  return this.getValidToken(userId);
}
  

  async getUserById(userId: string) {
  return this.prisma.user.findUnique({
    where: { id: userId },
  });
}
}