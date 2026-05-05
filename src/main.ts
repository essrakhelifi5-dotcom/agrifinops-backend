import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Active CORS pour permettre les requêtes du frontend
app.enableCors({
  origin: '*',
  methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  allowedHeaders: '*',
});

  await app.listen(3001);
  console.log(' Backend running on http://localhost:3001');
}
bootstrap();