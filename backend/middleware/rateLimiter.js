/**
 * Rate limiter middleware
 */

const rateLimit = require('express-rate-limit');

function createRateLimiter(config) {
  return rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        message: 'Too many requests. Please try again later.',
        status: 429,
      },
    },
  });
}

module.exports = { createRateLimiter };