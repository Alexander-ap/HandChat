#!/usr/bin/env node

import { writeFileSync } from 'node:fs'

const BASE = process.env.STRESS_BASE || 'http://localhost:3001'
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY || 20)
const ROUNDS = Number(process.env.STRESS_ROUNDS || 5)

function now() {
  return performance.now()
}

async function runBatch(path, label) {
  const startedAt = now()
  const tasks = Array.from({ length: CONCURRENCY }, async () => {
    const requestStartedAt = now()
    const response = await fetch(`${BASE}${path}`)
    const body = await response.json().catch(() => ({}))
    return {
      ok: response.ok,
      status: response.status,
      durationMs: now() - requestStartedAt,
      body,
    }
  })

  const results = await Promise.all(tasks)
  const durations = results.map((item) => item.durationMs)
  const failures = results.filter((item) => !item.ok)
  const avg = durations.reduce((sum, value) => sum + value, 0) / Math.max(durations.length, 1)
  const max = Math.max(...durations)
  const p95 = durations.sort((a, b) => a - b)[Math.max(0, Math.floor(durations.length * 0.95) - 1)]

  console.log(`${label}: total=${results.length} failures=${failures.length} avg=${avg.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms batch=${(now() - startedAt).toFixed(1)}ms`)
  if (failures.length > 0) {
    console.log('  first_failure=', JSON.stringify(failures[0]))
    process.exitCode = 1
  }
  return {
    label,
    path,
    total: results.length,
    failures: failures.length,
    avgMs: Number(avg.toFixed(1)),
    p95Ms: Number(p95.toFixed(1)),
    maxMs: Number(max.toFixed(1)),
    firstFailure: failures[0] || null,
  }
}

async function main() {
  const report = {
    startedAt: new Date().toISOString(),
    baseUrl: BASE,
    concurrency: CONCURRENCY,
    rounds: ROUNDS,
    results: [],
  }
  console.log(`[stress-test] base=${BASE} concurrency=${CONCURRENCY} rounds=${ROUNDS}`)
  for (let i = 0; i < ROUNDS; i += 1) {
    report.results.push(await runBatch('/health', `round_${i + 1}_health`))
    report.results.push(await runBatch('/api/posts', `round_${i + 1}_posts`))
  }
  report.finishedAt = new Date().toISOString()
  report.exitCode = process.exitCode || 0
  writeFileSync('stress-report.json', JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error('[stress-test] failed:', error.message)
  process.exit(1)
})
