type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  userId?: string;
  jobId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// In production, only show warn and error
const MIN_LOG_LEVEL: LogLevel = 
  import.meta.env.MODE === 'production' ? 'warn' : 'debug';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LOG_LEVEL];
}

function formatLog(entry: LogEntry): string {
  const contextStr = entry.context 
    ? ` ${JSON.stringify(entry.context)}` 
    : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${contextStr}`;
}

function createLogEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const entry = createLogEntry(level, message, context);
  const formatted = formatLog(entry);

  switch (level) {
    case 'debug':
      console.debug(formatted);
      break;
    case 'info':
      console.info(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
  
  // Helper for logging with user context
  withUser: (userId: string) => ({
    debug: (message: string, context?: LogContext) => 
      log('debug', message, { ...context, userId }),
    info: (message: string, context?: LogContext) => 
      log('info', message, { ...context, userId }),
    warn: (message: string, context?: LogContext) => 
      log('warn', message, { ...context, userId }),
    error: (message: string, context?: LogContext) => 
      log('error', message, { ...context, userId }),
  }),
  
  // Helper for logging with job context
  withJob: (jobId: string, userId?: string) => ({
    debug: (message: string, context?: LogContext) => 
      log('debug', message, { ...context, jobId, userId }),
    info: (message: string, context?: LogContext) => 
      log('info', message, { ...context, jobId, userId }),
    warn: (message: string, context?: LogContext) => 
      log('warn', message, { ...context, jobId, userId }),
    error: (message: string, context?: LogContext) => 
      log('error', message, { ...context, jobId, userId }),
  }),
};

export default logger;
