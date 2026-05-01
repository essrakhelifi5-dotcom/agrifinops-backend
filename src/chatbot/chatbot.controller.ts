import { Controller, Post, Body, UseGuards, Req, Delete } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('chatbot')
@UseGuards(JwtAuthGuard)
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post('chat')
  async chat(@Body() body: { message: string }, @Req() req: any) {
    const userId = req.user.userId;
    const response = await this.chatbotService.chat(body.message, userId);
    return { response };
  }

  @Delete('clear')
  clearHistory(@Req() req: any) {
    const userId = req.user.userId;
    this.chatbotService.clearHistory(userId);
    return { message: 'Historique effacé' };
  }
}