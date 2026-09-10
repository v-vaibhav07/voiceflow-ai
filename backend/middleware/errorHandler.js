/**
 * Central error handling middleware
 */

const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Request error', {
    method: req.method,
    path: req.path,
    status,
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  res.status(status).json({
    error: {
      message,
      status,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      status: 404,
    },
  });
}

module.exports = { errorHandler, notFoundHandler };