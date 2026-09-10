// /**
//  * Evaluation Service
//  *
//  * Records evaluation runs and their metric results in Supabase.
//  * Provides aggregation for the evaluation dashboard.
//  */

// const { db } = require('../config/supabase');
// const logger = require('../utils/logger');

// class EvaluationService {
//   constructor({ supabase }) {
//     this.supabase = supabase;
//     this.log = logger.child({ service: 'evaluation' });
//   }

//   async startRun({ testName, description, config = {} }) {
//     if (!this.supabase) {
//       return { id: require('uuid').v4(), test_name: testName, status: 'running' };
//     }
//     return db.addEvaluationRun(this.supabase, {
//       test_name: testName,
//       description,
//       test_config: config,
//       status: 'running',
//     });
//   }

//   async completeRun(runId, status = 'completed') {
//     if (!this.supabase) return null;
//     const { data, error } = await this.supabase
//       .from('evaluation_runs')
//       .update({ status, completed_at: new Date().toISOString() })
//       .eq('id', runId)
//       .select()
//       .single();
//     if (error) {
//       this.log.error('Failed to complete evaluation run', { error: error.message });
//     }
//     return data;
//   }

//   async recordMetric(runId, { name, value, unit = 'ms', passed = null, threshold = null, metadata = {} }) {
//     if (!this.supabase) return null;
//     return db.addEvaluationResult(this.supabase, {
//       evaluation_run_id: runId,
//       metric_name: name,
//       metric_value: value,
//       unit,
//       passed,
//       threshold,
//       metadata,
//     });
//   }

//   async recordMetrics(runId, metrics) {
//     const results = [];
//     for (const m of metrics) {
//       results.push(await this.recordMetric(runId, m));
//     }
//     return results;
//   }

//   async getRuns(limit = 20) {
//     if (!this.supabase) return [];
//     return db.getEvaluationRuns(this.supabase, limit);
//   }

//   async getRunSummary() {
//     if (!this.supabase) {
//       return {
//         totalRuns: 0,
//         passRate: null,
//         avgLatencyMs: null,
//         latestRun: null,
//       };
//     }

//     const runs = await this.getRuns(50);
//     const allResults = runs.flatMap((r) => r.evaluation_results || []);
//     const passed = allResults.filter((r) => r.passed === true).length;
//     const total = allResults.filter((r) => r.passed !== null).length;
//     const latencies = allResults.filter((r) => r.unit === 'ms').map((r) => Number(r.metric_value));

//     return {
//       totalRuns: runs.length,
//       totalMetrics: allResults.length,
//       passRate: total > 0 ? Math.round((passed / total) * 100) : null,
//       avgLatencyMs: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null,
//       latestRun: runs[0] || null,
//     };
//   }
// }

// module.exports = { EvaluationService };













/**
 * Evaluation Service
 *
 * Records evaluation runs and their metric results in Supabase.
 * Provides aggregation for the evaluation dashboard.
 */

const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/supabase');
const logger = require('../utils/logger');

class EvaluationService {
  constructor({ supabase }) {
    this.supabase = supabase;
    this.log = logger.child({
      service: 'evaluation',
    });
  }

  /**
   * Start a new evaluation run.
   */
  async startRun({
    testName,
    description,
    config = {},
  }) {
    if (!this.supabase) {
      return {
        id: uuidv4(),
        test_name: testName,
        description,
        test_config: config,
        status: 'running',
        started_at:
          new Date().toISOString(),
      };
    }

    try {
      return await db.addEvaluationRun(
        this.supabase,
        {
          test_name: testName,
          description,
          test_config: config,
          status: 'running',
        }
      );
    } catch (error) {
      this.log.error(
        'Failed to start evaluation run',
        {
          error: error.message,
          testName,
        }
      );

      throw error;
    }
  }

  /**
   * Complete an evaluation run.
   *
   * status:
   *   running
   *   completed
   *   failed
   */
  async completeRun(
    runId,
    status = 'completed'
  ) {
    if (!this.supabase) {
      return {
        id: runId,
        status,
        completed_at:
          new Date().toISOString(),
      };
    }

    /*
     * Only allow known evaluation statuses.
     */
    const allowedStatuses = [
      'running',
      'completed',
      'failed',
    ];

    const finalStatus =
      allowedStatuses.includes(status)
        ? status
        : 'failed';

    const { data, error } =
      await this.supabase
        .from('evaluation_runs')
        .update({
          status: finalStatus,
          completed_at:
            new Date().toISOString(),
        })
        .eq('id', runId)
        .select()
        .single();

    if (error) {
      this.log.error(
        'Failed to complete evaluation run',
        {
          runId,
          status: finalStatus,
          error: error.message,
        }
      );

      throw error;
    }

    return data;
  }

  /**
   * Record one evaluation metric.
   */
  async recordMetric(
    runId,
    {
      name,
      value,
      unit = 'ms',
      passed = null,
      threshold = null,
      metadata = {},
    }
  ) {
    if (!this.supabase) {
      return {
        id: uuidv4(),
        evaluation_run_id: runId,
        metric_name: name,
        metric_value: value,
        unit,
        passed,
        threshold,
        metadata,
      };
    }

    try {
      return await db.addEvaluationResult(
        this.supabase,
        {
          evaluation_run_id: runId,
          metric_name: name,
          metric_value: value,
          unit,
          passed,
          threshold,
          metadata,
        }
      );
    } catch (error) {
      this.log.error(
        'Failed to record evaluation metric',
        {
          runId,
          metric: name,
          error: error.message,
        }
      );

      throw error;
    }
  }

  /**
   * Record multiple metrics.
   */
  async recordMetrics(
    runId,
    metrics = []
  ) {
    const results = [];

    for (const metric of metrics) {
      try {
        const result =
          await this.recordMetric(
            runId,
            metric
          );

        results.push(result);
      } catch (error) {
        /*
         * Continue recording remaining metrics.
         */
        this.log.error(
          'Metric recording failed',
          {
            runId,
            metric:
              metric?.name,
            error:
              error.message,
          }
        );
      }
    }

    return results;
  }

  /**
   * Get evaluation runs.
   */
  async getRuns(limit = 20) {
    if (!this.supabase) {
      return [];
    }

    return db.getEvaluationRuns(
      this.supabase,
      limit
    );
  }

  /**
   * Calculate dashboard summary.
   *
   * IMPORTANT:
   * Pass rate is calculated at the RUN level.
   *
   * A failed evaluation run counts as failed even
   * when it contains zero evaluation metrics.
   */
  async getRunSummary() {
    if (!this.supabase) {
      return {
        totalRuns: 0,
        totalMetrics: 0,
        passRate: null,
        avgLatencyMs: null,
        latestRun: null,
      };
    }

    const runs =
      await this.getRuns(50);

    const allResults =
      runs.flatMap(
        (run) =>
          Array.isArray(
            run.evaluation_results
          )
            ? run.evaluation_results
            : []
      );

    /*
     * --------------------------------------------------
     * RUN-LEVEL PASS/FAIL
     * --------------------------------------------------
     *
     * failed       -> failed
     * running      -> not counted
     * completed    -> passed unless one of its measured
     *                 metrics explicitly failed
     */
    let passedRuns = 0;
    let evaluatedRuns = 0;

    for (const run of runs) {
      const status =
        String(
          run.status || ''
        ).toLowerCase();

      /*
       * A currently running run is not evaluated yet.
       */
      if (status === 'running') {
        continue;
      }

      /*
       * Explicitly failed run.
       */
      if (status === 'failed') {
        evaluatedRuns += 1;
        continue;
      }

      /*
       * Completed run.
       */
      if (status === 'completed') {
        evaluatedRuns += 1;

        const results =
          Array.isArray(
            run.evaluation_results
          )
            ? run.evaluation_results
            : [];

        const measuredFailures =
          results.filter(
            (result) =>
              result.passed === false
          );

        /*
         * Completed run passes only when none of its
         * measured metrics failed.
         */
        if (
          measuredFailures.length === 0
        ) {
          passedRuns += 1;
        }
      }
    }

    /*
     * --------------------------------------------------
     * LATENCY
     * --------------------------------------------------
     *
     * Only numeric millisecond metrics are included.
     *
     * bool/count metrics must not pollute the latency
     * calculation.
     */
    const latencies =
      allResults
        .filter(
          (result) =>
            String(
              result.unit || ''
            ).toLowerCase() === 'ms'
        )
        .map(
          (result) =>
            Number(
              result.metric_value
            )
        )
        .filter(
          (value) =>
            Number.isFinite(value) &&
            value >= 0
        );

    const avgLatencyMs =
      latencies.length > 0
        ? Math.round(
            latencies.reduce(
              (sum, value) =>
                sum + value,
              0
            ) /
              latencies.length
          )
        : null;

    /*
     * Latest run.
     *
     * getEvaluationRuns normally returns newest first,
     * but sorting here makes the service robust.
     */
    const sortedRuns =
      [...runs].sort(
        (a, b) => {
          const aTime =
            new Date(
              a.started_at ||
                a.created_at ||
                0
            ).getTime();

          const bTime =
            new Date(
              b.started_at ||
                b.created_at ||
                0
            ).getTime();

          return bTime - aTime;
        }
      );

    return {
      totalRuns: runs.length,

      totalMetrics:
        allResults.length,

      passRate:
        evaluatedRuns > 0
          ? Math.round(
              (passedRuns /
                evaluatedRuns) *
                100
            )
          : null,

      avgLatencyMs,

      latestRun:
        sortedRuns[0] || null,
    };
  }
}

module.exports = {
  EvaluationService,
};