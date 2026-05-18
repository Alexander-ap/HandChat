type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = `[${entry.time}] [${level}] ${message}${meta ? ' ' + JSON.stringify(meta) : ''}`;
  switch (level) {
    case 'ERROR': console.error(line); break;
    case 'WARN':  console.warn(line);  break;
    default:      console.log(line);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('DEBUG', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => log('INFO', msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log('WARN', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('ERROR', msg, meta),
};
