export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type LogEntry = {
  id: number;
  time: string;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
};

export type Logger = {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
};

const listeners = new Set<(entry: LogEntry) => void>();
const entries: LogEntry[] = [];
const MAX_ENTRIES = 200;
let nextId = 1;

function formatData(data: unknown): string {
  if (data === undefined) {
    return '';
  }

  try {
    return ` ${JSON.stringify(data)}`;
  } catch {
    return ` ${String(data)}`;
  }
}

function emit(level: LogLevel, scope: string, message: string, data?: unknown): void {
  const entry: LogEntry = {
    id: nextId++,
    time: new Date().toISOString(),
    level,
    scope,
    message,
    data
  };

  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }

  for (const listener of listeners) {
    listener(entry);
  }
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, data) => emit('DEBUG', scope, message, data),
    info: (message, data) => emit('INFO', scope, message, data),
    warn: (message, data) => emit('WARN', scope, message, data),
    error: (message, data) => emit('ERROR', scope, message, data)
  };
}

export function subscribeLogs(listener: (entry: LogEntry) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLogs(): LogEntry[] {
  return [...entries];
}

export function formatLogEntry(entry: LogEntry): string {
  return `${entry.time} [${entry.level}] [${entry.scope}] ${entry.message}${formatData(entry.data)}`;
}
