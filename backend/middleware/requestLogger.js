/**
 * Request logger middleware
 */

const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, path } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const meta = {
      method,
      path,
      status: res.statusCode,
      duration: `${duration}ms`,
    };
    if (res.statusCode >= 500) logger.error('Request completed', meta);
    else if (res.statusCode >= 400) logger.warn('Request completed', meta);
    else logger.info('Request completed', meta);
  });

  next();
}

module.exports = { requestLogger };