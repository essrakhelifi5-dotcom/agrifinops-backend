import { Controller, Post, Body } from '@nestjs/common';
import { PasswordResetService } from './password-reset.service';

@Controller('password-reset')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  // ÉTAPE 1-4 : Demande de code
  @Post('request')
  async requestReset(@Body() body: { email: string }) {
    return this.passwordResetService.requestPasswordReset(body.email);
  }

  // ÉTAPE 5 : Vérification du code
  @Post('verify')
  async verifyCode(@Body() body: { email: string; code: string }) {
    return this.passwordResetService.verifyResetCode(body.email, body.code);
  }

  // ÉTAPE 6-7 : Nouveau mot de passe
  @Post('reset')
  async resetPassword(
    @Body() body: { email: string; code: string; newPassword: string },
  ) {
    return this.passwordResetService.resetPassword(
      body.email,
      body.code,
      body.newPassword,
    );
  }
}