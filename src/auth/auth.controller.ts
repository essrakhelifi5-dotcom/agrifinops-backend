import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  

  @Post('signup')
  async signup(
    @Body() body: { name: string; email: string; password: string; role: string ,dateOfBirth: Date },
  ) {
    return this.authService.signup(body.name, body.email, body.password, body.role  , body.dateOfBirth|| 'User');
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    //  validateUser d'abord, puis login avec le user retourné
    const user = await this.authService.validateUser(body.email, body.password);
    return this.authService.login(user);
  }
}