import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // GET /admin/users
  @Get('users')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  // POST /admin/users
  @Post('users')
  async createUser(
    @Body() body: { 
      name: string; 
      email: string; 
      password: string; 
      role: string;
      company: string;  // ✅ AJOUT COMPANY
    },
  ) {
    return this.adminService.createUser(
      body.name,
      body.email,
      body.password,
      body.role,
      body.company,  // ✅ AJOUT COMPANY
    );
  }

  // PUT /admin/users/:id
  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() body: { 
      name?: string; 
      email?: string; 
      role?: string;
      company?: string;  // ✅ AJOUT COMPANY
    },
  ) {
    return this.adminService.updateUser(
      id,
      body.name,
      body.email,
      body.role,
      body.company,  // ✅ AJOUT COMPANY
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
    return this.adminService.getSystemStats(company);  // ✅ FILTRE PAR COMPANY
  }
}