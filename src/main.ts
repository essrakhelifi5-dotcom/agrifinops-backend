import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

let app;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create(AppModule);
    app.enableCors({
      origin: 'https://agrifinops-frontend.vercel.app',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      preflightContinue: false,
      optionsSuccessStatus: 204,
    });
    await app.init();
  }
  return app;
}

export default async function handler(req, res) {
  const app = await bootstrap();
  const server = app.getHttpAdapter().getInstance();
  server(req, res);
}

// Pour le développement local
if (process.env.NODE_ENV !== 'production') {
  bootstrap().then(async (app) => {
    await app.listen(process.env.PORT || 3001);
    console.log('Backend running on http://localhost:3001');
  });
}