import { Inject, Injectable } from '@nestjs/common';
import { HEALTH_READ_PORT, HealthReadPort, HealthStats } from '../domain/health.types';

@Injectable()
export class HealthCheckUseCase {
  constructor(
    @Inject(HEALTH_READ_PORT)
    private readonly healthRead: HealthReadPort,
  ) {}

  execute(): Promise<HealthStats> {
    return this.healthRead.getStats();
  }
}
