import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { ClassifyController } from '../src/presentation/api/classify.controller';
import { ClassifyProductUseCase } from '../src/application/classify-product.use-case';
import { HealthCheckUseCase } from '../src/application/health-check.use-case';
import { ApiKeyGuard } from '../src/presentation/guards/api-key.guard';

describe('ClassifyController (HTTP)', () => {
  let app: INestApplication;
  const classifyExecute = jest.fn();
  const healthExecute = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClassifyController],
      providers: [
        {
          provide: ClassifyProductUseCase,
          useValue: { execute: classifyExecute },
        },
        {
          provide: HealthCheckUseCase,
          useValue: { execute: healthExecute },
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /classify returns classification result', async () => {
    classifyExecute.mockResolvedValue({
      code: '5607 41',
      name: 'мотузка',
      group: '56',
      confidence: 0.9,
      reason: 'ok',
      requiresReview: false,
      candidates: [],
    });

    const response = await request(app.getHttpServer())
      .post('/classify')
      .send({ product: 'мотузка поліпропіленова' })
      .expect(201);

    expect(response.body.code).toBe('5607 41');
    expect(classifyExecute).toHaveBeenCalledWith('мотузка поліпропіленова');
  });

  it('POST /classify rejects empty body', async () => {
    await request(app.getHttpServer())
      .post('/classify')
      .send({ product: '' })
      .expect(400);

    expect(classifyExecute).not.toHaveBeenCalled();
  });

  it('GET /health returns stats', async () => {
    healthExecute.mockResolvedValue({
      status: 'ok',
      positionsLoaded: 14872,
      embeddingsLoaded: 14776,
      searchMode: 'hybrid',
      checks: {
        database: true,
        positions: true,
        embeddings: true,
      },
    });

    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.positionsLoaded).toBe(14872);
    expect(healthExecute).toHaveBeenCalled();
  });
});
