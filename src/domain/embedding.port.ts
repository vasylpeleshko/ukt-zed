export interface EmbeddingPort {
  embed(text: string): Promise<number[]>;
}

export const EMBEDDING_PORT = Symbol('EMBEDDING_PORT');

export interface EmbeddingStatusPort {
  hasEmbeddings(): boolean;
  getEmbeddedCount(): number;
  refresh(): Promise<void>;
}

export const EMBEDDING_STATUS_PORT = Symbol('EMBEDDING_STATUS_PORT');
