import { Command, CommandRunner, Option } from 'nest-commander';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ClassifyProductUseCase } from '../application/classify-product.use-case';
import fs from 'fs';
import path from 'path';

@Command({ name: 'classify', description: 'Classify a product by UKTZED code' })
export class ClassifyCommand extends CommandRunner {
  async run(_params: string[], options: { product?: string }): Promise<void> {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });

    try {
      const useCase = app.get(ClassifyProductUseCase);
      const product = options.product ?? _params.join(' ');

      if (!product) {
        console.error('Usage: npm run cli -- classify --product "мотузка"');
        process.exit(1);
      }

      const result = await useCase.execute(product);
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await app.close();
    }
  }

  @Option({ flags: '-p, --product <product>', description: 'Product description' })
  parseProduct(val: string) {
    return val;
  }
}

interface BenchmarkCase {
  product: string;
  expectedCode: string;
}

@Command({ name: 'benchmark', description: 'Run benchmark against test fixtures' })
export class BenchmarkCommand extends CommandRunner {
  async run(): Promise<void> {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });

    try {
      const useCase = app.get(ClassifyProductUseCase);
      const fixturePath = path.join(process.cwd(), 'test/fixtures/benchmark.json');
      const cases: BenchmarkCase[] = JSON.parse(
        fs.readFileSync(fixturePath, 'utf-8'),
      );

      let top1 = 0;
      let top5 = 0;

      for (const c of cases) {
        const result = await useCase.execute(c.product);
        const expectedPrefix = c.expectedCode.replace(/\s/g, '').slice(0, 10);
        const resultPrefix = (result.code ?? '').replace(/\s/g, '').slice(0, 10);

        const matchTop1 = resultPrefix.startsWith(expectedPrefix.slice(0, 10)) ||
          expectedPrefix.startsWith(resultPrefix.slice(0, 10));

        const matchTop5 =
          matchTop1 ||
          result.candidates.some(( cand) => {
            const candPrefix = cand.code.replace(/\s/g, '');
            return candPrefix.startsWith(expectedPrefix.slice(0, 6)) ||
              expectedPrefix.startsWith(candPrefix.slice(0, 6));
          });

        if (matchTop1) top1++;
        if (matchTop5) top5++;

        console.log(
          `${matchTop1 ? '✓' : matchTop5 ? '~' : '✗'} "${c.product}" → expected ${c.expectedCode}, got ${result.code ?? 'null'} (${result.confidence})`,
        );
      }

      console.log(`\nTop-1: ${top1}/${cases.length} (${((top1 / cases.length) * 100).toFixed(1)}%)`);
      console.log(`Top-5: ${top5}/${cases.length} (${((top5 / cases.length) * 100).toFixed(1)}%)`);
    } finally {
      await app.close();
    }
  }
}
