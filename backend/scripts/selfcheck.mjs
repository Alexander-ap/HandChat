import 'dotenv/config';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const checks = [];
let hasFailure = false;

function pass(name, detail = '') {
  checks.push({ status: 'PASS', name, detail });
}

function warn(name, detail = '') {
  checks.push({ status: 'WARN', name, detail });
}

function fail(name, detail = '') {
  hasFailure = true;
  checks.push({ status: 'FAIL', name, detail });
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function normalizeDatabaseUrl(value) {
  if (!value) return undefined;

  const url = new URL(value);
  const isSupabaseTransactionPooler = url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543';

  if (isSupabaseTransactionPooler) {
    if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
    if (!url.searchParams.has('sslmode')) url.searchParams.set('sslmode', 'require');
  }

  return url.toString();
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    if (url.username) url.username = '***';
    return url.toString();
  } catch {
    return '<invalid-url>';
  }
}

async function checkRequiredEnv() {
  const required = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    fail('required environment variables', `missing: ${missing.join(', ')}`);
    return false;
  }

  pass('required environment variables');
  return true;
}

function resolveCeCslAssetPath(envKey, fallbackRelativePath) {
  const configured = process.env[envKey];
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(repoRoot, configured);
  }

  return path.resolve(repoRoot, fallbackRelativePath);
}

async function checkCeCslAssets() {
  const modelPath = resolveCeCslAssetPath('CECSL_MODEL_PATH', path.join('CE-CSL', 'custom_model.pth'));
  const vocabPath = resolveCeCslAssetPath('CECSL_VOCAB_PATH', path.join('CE-CSL', 'custom_vocab.json'));
  const gestureModelPath = resolveCeCslAssetPath('CECSL_GESTURE_MODEL_PATH', path.join('CE-CSL', 'gesture_recognizer.task'));

  const assets = [
    ['CE-CSL model asset', modelPath],
    ['CE-CSL vocab asset', vocabPath],
    ['CE-CSL gesture asset', gestureModelPath],
  ];

  for (const [name, assetPath] of assets) {
    try {
      const stat = await fs.stat(assetPath);
      pass(name, `${assetPath} (${stat.size} bytes)`);
    } catch (error) {
      fail(name, `${assetPath} (${error.message})`);
    }
  }

  try {
    const raw = await fs.readFile(vocabPath, 'utf8');
    const vocab = JSON.parse(raw);
    if (!Array.isArray(vocab) || vocab.some((item) => typeof item !== 'string')) {
      fail('CE-CSL vocab format', 'custom_vocab.json must be a JSON string array');
      return;
    }
    pass('CE-CSL vocab format', `labels=${vocab.join(', ')}`);
  } catch (error) {
    fail('CE-CSL vocab format', error.message);
  }
}

function checkDatabaseUrl() {
  try {
    const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
    const url = new URL(databaseUrl);
    const isSupabaseTransactionPooler = url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543';

    if (isSupabaseTransactionPooler) {
      const expected = {
        pgbouncer: 'true',
        connection_limit: '1',
        sslmode: 'require',
      };
      const missing = Object.entries(expected)
        .filter(([key, value]) => url.searchParams.get(key) !== value)
        .map(([key]) => key);

      if (missing.length > 0) {
        fail('database URL pooler parameters', `missing/invalid: ${missing.join(', ')}`);
      } else {
        pass('database URL pooler parameters');
      }
    } else {
      pass('database URL parsed', `${url.hostname}:${url.port || 'default'}`);
    }

    process.env.DATABASE_URL = databaseUrl;
    return databaseUrl;
  } catch (error) {
    fail('database URL parsed', error.message);
    return undefined;
  }
}

async function checkPrisma(databaseUrl) {
  if (!databaseUrl) return;

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await prisma.$queryRawUnsafe('select 1 as ok');
    pass('Prisma database connection', redactUrl(databaseUrl));
  } catch (error) {
    fail('Prisma database connection', error.message.split('\n').slice(-3).join(' '));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function checkCeCslHealth() {
  const enabled = parseBoolean(process.env.CECSL_ENABLED, true);
  if (!enabled) {
    pass('CE-CSL inference health', 'disabled by CECSL_ENABLED');
    return;
  }

  const baseUrl = process.env.CECSL_INFERENCE_URL || 'http://127.0.0.1:8008';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(new URL('/health', baseUrl), { signal: controller.signal });
    if (!response.ok) {
      warn('CE-CSL inference health', `HTTP ${response.status}`);
      return;
    }

    const body = await response.json();
    if (body.status === 'ok' && body.model_loaded) {
      pass(
        'CE-CSL inference health',
        `device=${body.device ?? 'unknown'}, vocab=${body.vocab_size ?? 'unknown'}, model=${body.model_path ?? 'unknown'}`
      );
    } else {
      warn('CE-CSL inference health', JSON.stringify(body));
    }
  } catch (error) {
    warn('CE-CSL inference health', error.name === 'AbortError' ? 'timeout' : error.message);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const envOk = await checkRequiredEnv();
  const databaseUrl = envOk ? checkDatabaseUrl() : undefined;
  await checkCeCslAssets();
  await checkPrisma(databaseUrl);
  await checkCeCslHealth();

  for (const check of checks) {
    const detail = check.detail ? ` - ${check.detail}` : '';
    console.log(`[${check.status}] ${check.name}${detail}`);
  }

  if (hasFailure) {
    process.exitCode = 1;
    return;
  }

  console.log('Selfcheck completed successfully.');
}

main().catch((error) => {
  console.error('[FAIL] selfcheck crashed');
  console.error(error);
  process.exitCode = 1;
});
