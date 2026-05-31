import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
//Il sert à vérifier que l’utilisateur est authentifié avec un token JWT.
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
//Controller : déclare une classe comme contrôleur.
//Toutes les routes de cette classe commencent par /admin.
@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  //readonly : on ne peut pas remplacer cette valeur après.
  constructor(private readonly adminService: AdminService) {}

  // GET /admin/users
  @Get('users')
  async getAllUsers() {
    //demande au service de récupérer tous les utilisateurs.
    return this.adminService.getAllUsers();
  }

  // POST /admin/users
  @Post('users')
  async createUser(
    //@Body() récupère les données envoyées par le client.
    @Body() body: { 
      name: string; 
      email: string; 
      password: string; 
      role: string;
      company: string;  
    },
  ) {
    //Le contrôleur envoie ces valeurs au service pour créer l’utilisateur.
    return this.adminService.createUser(
      body.name,
      body.email,
      body.password,
      body.role,
      body.company,  
    );
  }

  // route=PUT /admin/users/:id
  @Put('users/:id')
  async updateUser(
    //Cette ligne récupère id depuis l’URL.
    @Param('id') id: string,
    @Body() body: { 
      //Ici, les champs ont ?, donc ils sont optionnels.
      name?: string; 
      email?: string; 
      role?: string;
      company?: string;  
    },
  ) {//Le contrôleur envoie l’id et les nouvelles données au service.
    return this.adminService.updateUser(
      id,
      body.name,
      body.email,
      body.role,
      body.company,  
    );
  }

  // DELETE /admin/users/:id
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // PATCH /admin/users/:id/status
  @Patch('users/:id/status')
  async toggleUserStatus(
    @Param('id') id: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.adminService.toggleUserStatus(id, body.isActive);
  }

  // GET /admin/stats?company=S1
  @Get('stats')
  async getSystemStats(@Query('company') company?: string) {
    return this.adminService.getSystemStats(company);  
  }
}