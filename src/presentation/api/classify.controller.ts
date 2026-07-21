import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ClassifyProductUseCase } from '../../application/classify-product.use-case';
import { HealthCheckUseCase } from '../../application/health-check.use-case';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { Public } from '../guards/public.decorator';

class ClassifyRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  product!: string;
}

@Controller()
@UseGuards(ThrottlerGuard, ApiKeyGuard)
export class ClassifyController {
  constructor(
    private readonly classifyProduct: ClassifyProductUseCase,
    private readonly healthCheck: HealthCheckUseCase,
  ) {}

  @Post('classify')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  classify(@Body() dto: ClassifyRequestDto) {
    return this.classifyProduct.execute(dto.product);
  }

  @Public()
  @Get('health')
  health() {
    return this.healthCheck.execute();
  }
}
