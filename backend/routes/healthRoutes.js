const express = require('express');

function healthRoutes() {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({
      status: 'ok',
      service: 'voiceflow-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  return router;
}

module.exports = { healthRoutes };