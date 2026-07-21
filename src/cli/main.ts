import { CommandFactory } from 'nest-commander';
import { Module } from '@nestjs/common';
import { AppModule } from '../app.module';
import { BenchmarkCommand, ClassifyCommand } from './commands';

@Module({
  providers: [ClassifyCommand, BenchmarkCommand],
})
class CliModule {}

async function bootstrap() {
  await CommandFactory.run(CliModule, { logger: ['error', 'warn', 'log'] });
}

bootstrap();
