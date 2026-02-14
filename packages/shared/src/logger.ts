export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type Logger = {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
};

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

function log(level: LogLevel, scope: string, message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const formattedMessage = `${timestamp} [${level}] [${scope}] ${message}${formatData(data)}`;

  switch (level) {
    case 'DEBUG':
      console.debug(formattedMessage);
      break;
    case 'INFO':
      console.info(formattedMessage);
      break;
    case 'WARN':
      console.warn(formattedMessage);
      break;
    case 'ERROR':
      console.error(formattedMessage);
      break;
  }
}

export function createLogger(scope: string): Logger {
  return {
    debug: (message, data) => log('DEBUG', scope, message, data),
    info: (message, data) => log('INFO', scope, message, data),
    warn: (message, data) => log('WARN', scope, message, data),
    error: (message, data) => log('ERROR', scope, message, data)
  };
}
