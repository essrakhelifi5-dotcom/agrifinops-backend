//Query : récupère les paramètres dans l’URL après ?
//Res : permet d’utiliser directement la réponse Express.
//Req : permet d’accéder à la requête Express.
import {
  Controller,
  Get,
  Query,
  Res,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { QuickbooksService } from './quickbooks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('quickbooks')
export class QuickbooksController {
  constructor(
    private readonly qbService: QuickbooksService,
    private readonly jwtService: JwtService, 
  ) {}

  //  Plus de @UseGuards — vérification manuelle du token en query param
  @Get('auth')
  //Récupère la valeur du paramètre token dans l’URL et la réponse Express. 
  //reponse express pour faire une redirection après.
  connect(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      throw new UnauthorizedException('Token manquant');
    }
    
    try {
      //Cette ligne vérifie que le token JWT est valide.
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });
      //récupère l’identifiant de l’utilisateur depuis le token.
      const userId = payload.sub;
      //service QuickBooks génére l’URL de connexion QuickBooks.
      const url = this.qbService.getAuthorizationUrl(userId);
      return res.redirect(url);
    } catch {
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  
  @Get('callback')
  //Récupère tous les paramètres de l’URL
async callback(@Query() query: any, @Res() res: Response) {
  //On extrait trois valeurs depuis les paramètres URL 
  const { code, realmId, state } = query;
  //On récupère l’id utilisateur depuis state
  const userId = state.split('_')[0];


  // Échange le code et sauvegarde le token
  await this.qbService.exchangeCode(code, realmId, state, userId);

  // Récupère le rôle de l'utilisateur depuis la DB
  const user = await this.qbService.getUserById(userId);

  // Redirige selon le rôle
  if (user?.role === 'Manager') {
    return res.redirect('http://localhost:3000/dashboard/Manager');
  }

  return res.redirect('http://localhost:3000/dashboard/Ceo');
}

  //  Guard normal car appelé depuis le frontend avec header Authorization
  @UseGuards(JwtAuthGuard)
  @Get('company-info')
  async getCompanyInfo(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.qbService.getCompanyInfo(userId);
  }
}