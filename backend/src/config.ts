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

const resolvedDatabaseUrl = decryptIfNeeded() || process.env.DATABASE_URL

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
};
