declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AI_PROVIDER?: string;
    OLLAMA_BASE_URL?: string;
    OLLAMA_MODEL?: string;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    OPERATIONS_TOKEN?: string;
  }
}
