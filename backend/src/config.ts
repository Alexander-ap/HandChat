import 'dotenv/config';
import crypto from 'crypto'

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`FATAL: Environment variable ${key} is not set`);
    process.exit(1);
  }
  return val;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

function parseNumber(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function decryptIfNeeded(): string | undefined {
  const encrypted = process.env.DATABASE_URL_ENCRYPTED
  const secret = process.env.DATABASE_URL_SECRET
  if (!encrypted || !secret) return undefined

  const [ivHex, tagHex, payloadHex] = encrypted.split(':')
  if (!ivHex || !tagHex || !payloadHex) {
    console.error('FATAL: DATABASE_URL_ENCRYPTED format invalid')
    process.exit(1)
  }

  const key = crypto.createHash('sha256').update(secret).digest()
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

function normalizeDatabaseUrl(value: string | undefined): string | undefined {
  if (!value) return undefined

  try {
    const url = new URL(value)
    const isSupabaseTransactionPooler = url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543'
    if (isSupabaseTransactionPooler) {
      if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true')
      if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1')
      if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require')
    }
    return url.toString()
  } catch {
    return value
  }
}

const resolvedDatabaseUrl = normalizeDatabaseUrl(decryptIfNeeded() || process.env.DATABASE_URL)
if (resolvedDatabaseUrl) {
  process.env.DATABASE_URL = resolvedDatabaseUrl
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl: resolvedDatabaseUrl || requireEnv('DATABASE_URL'),
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  nodeEnv: process.env.NODE_ENV || 'development',
  ceCsl: {
    enabled: parseBoolean(process.env.CECSL_ENABLED, true),
    inferenceUrl: process.env.CECSL_INFERENCE_URL || 'http://127.0.0.1:8008',
    confidenceThreshold: parseNumber(process.env.CECSL_CONFIDENCE_THRESHOLD, 0.8),
    finalConfidenceThreshold: parseNumber(process.env.CECSL_FINAL_CONFIDENCE_THRESHOLD, 0.85),
    stableCount: parseNumber(process.env.CECSL_STABLE_COUNT, 3),
    predictEveryNFrames: parseNumber(process.env.CECSL_PREDICT_EVERY_N_FRAMES, 12),
    inferenceTimeoutMs: parseNumber(process.env.CECSL_INFERENCE_TIMEOUT_MS, 5000),
    sentencePauseMs: parseNumber(process.env.CECSL_SENTENCE_PAUSE_MS, 1500),
    swapHandedness: parseBoolean(process.env.CECSL_SWAP_HANDEDNESS, false),
  },
};
