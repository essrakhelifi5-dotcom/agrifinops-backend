import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Active CORS pour permettre les requêtes du frontend
  app.enableCors({
    origin: 'http://localhost:3000', // URL de ton frontend
    credentials: true,
  });

  await app.listen(3001);
  console.log(' Backend running on http://localhost:3001');
}
bootstrap();