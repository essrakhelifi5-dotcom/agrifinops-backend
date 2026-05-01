import { Controller, Get, Post, Put, Delete, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Post('users')
  async createUser(@Body() body: { name: string; email: string; password: string; role: string }) {
    return this.adminService.createUser(body.name, body.email, body.password, body.role);
  }

  @Put('users/:id')
  async updateUser(@Param('id') userId: string, @Body() body: { name?: string; email?: string; role?: string }) {
    return this.adminService.updateUser(userId, body);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  // ✅ ROUTE TOGGLE STATUS
  @Patch('users/:id/status')
  async toggleUserStatus(@Param('id') userId: string, @Body() body: { isActive: boolean }) {
    return this.adminService.toggleUserStatus(userId, body.isActive);
  }

  @Get('stats')
  async getSystemStats() {
    return this.adminService.getSystemStats();
  }
}