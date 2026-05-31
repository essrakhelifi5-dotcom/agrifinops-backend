// fichier de test pour AdminController.
//importe les outils de test de NestJS.
import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    // Vérifie que le contrôleur est défini (cree correctement).
    expect(controller).toBeDefined();
    
  });
});
