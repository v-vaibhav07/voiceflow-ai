/**
 * Structured logger with levels
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL || 'info'] ?? 1;

function format(level, message, meta) {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    return `${base} ${JSON.stringify(meta)}`;
  }
  return base;
}

const logger = {
  debug(message, meta = {}) {
    if (LEVELS.debug >= currentLevel) console.log(format('debug', message, meta));
  },
  info(message, meta = {}) {
    if (LEVELS.info >= currentLevel) console.log(format('info', message, meta));
  },
  warn(message, meta = {}) {
    if (LEVELS.warn >= currentLevel) console.warn(format('warn', message, meta));
  },
  error(message, meta = {}) {
    if (LEVELS.error >= currentLevel) console.error(format('error', message, meta));
  },
  child(context) {
    return {
      debug: (m, meta = {}) => logger.debug(m, { ...context, ...meta }),
      info: (m, meta = {}) => logger.info(m, { ...context, ...meta }),
      warn: (m, meta = {}) => logger.warn(m, { ...context, ...meta }),
      error: (m, meta = {}) => logger.error(m, { ...context, ...meta }),
    };
  },
};

module.exports = logger;