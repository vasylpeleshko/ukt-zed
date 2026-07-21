import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingPort } from '../../domain/embedding.port';

const OPENAI_TIMEOUT_MS = 30_000;

@Injectable()
export class OpenAiEmbeddingService implements EmbeddingPort {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('OPENAI_API_KEY'),
      timeout: OPENAI_TIMEOUT_MS,
    });
    this.model = this.config.get<string>('EMBEDDING_MODEL', 'text-embedding-3-small');
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text.slice(0, 2000),
    });

    const vector = response.data[0]?.embedding;
    if (!vector) {
      throw new Error('Empty embedding response');
    }

    return vector;
  }
}
