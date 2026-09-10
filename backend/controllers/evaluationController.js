/**
 * Evaluation Controller
 */

class EvaluationController {
  constructor({ evaluationService }) {
    this.evaluation = evaluationService;
  }

  /**
   * GET /api/evaluation/runs
   */
  listRuns = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const runs = await this.evaluation.getRuns(limit);
      res.json({ runs });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/evaluation/summary
   */
  summary = async (req, res, next) => {
    try {
      const summary = await this.evaluation.getRunSummary();
      res.json(summary);
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/evaluation/runs
   */
  startRun = async (req, res, next) => {
    try {
      const { testName, description, config } = req.body || {};
      if (!testName) return res.status(400).json({ error: { message: 'testName is required' } });
      const run = await this.evaluation.startRun({ testName, description, config });
      res.status(201).json({ run });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/evaluation/runs/:id/metrics
   */
  recordMetrics = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { metrics } = req.body || {};
      if (!Array.isArray(metrics)) {
        return res.status(400).json({ error: { message: 'metrics array is required' } });
      }
      const results = await this.evaluation.recordMetrics(id, metrics);
      res.json({ results });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/evaluation/runs/:id/complete
   */
  completeRun = async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status } = req.body || {};
      const run = await this.evaluation.completeRun(id, status || 'completed');
      res.json({ run });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { EvaluationController };