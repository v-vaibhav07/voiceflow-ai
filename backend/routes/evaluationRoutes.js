const express = require('express');

function evaluationRoutes(evaluationController) {
  const router = express.Router();
  router.get('/runs', evaluationController.listRuns);
  router.get('/summary', evaluationController.summary);
  router.post('/runs', evaluationController.startRun);
  router.post('/runs/:id/metrics', evaluationController.recordMetrics);
  router.post('/runs/:id/complete', evaluationController.completeRun);
  return router;
}

module.exports = { evaluationRoutes };