const express = require('express');

function voiceRoutes(voiceController) {
  const router = express.Router();
  router.get('/config', voiceController.getConfig);
  router.post('/synthesize', voiceController.synthesize);
  router.get('/health', voiceController.health);
  return router;
}

module.exports = { voiceRoutes };