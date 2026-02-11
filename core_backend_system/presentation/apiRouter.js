const express = require('express');

function createApiRouter(container) {
  const router = express.Router();

  // health for core api
  router.get('/health', (req, res) => {
    res.json({ ok: true, tenant: container.config.defaultTenant });
  });

  // Summary (polling)
  // GET /core/api/reports/:reportid/summary?email=...
  router.get('/reports/:reportid/summary', async (req, res, next) => {
    try {
      const reportid = Number(req.params.reportid);
      const email = String(req.query.email || '').trim();

      if (!Number.isFinite(reportid) || !email) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'reportid(number) and email(query) are required' },
        });
      }

      const { sttRepo, visitCategoryRepo } = container.repos(req);

      const result = await container.usecases.ensureSummary.execute({
        reportid,
        email,
        sttRepo,
        visitCategoryRepo,
      });

      if (result.status === 'PENDING') return res.status(202).json({ ok: true, ...result });
      if (result.status === 'FAILED') return res.status(500).json({ ok: false, error: result.error });
      return res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  // Policies (polling)
  // GET /core/api/reports/:reportid/policies?email=...
  router.get('/reports/:reportid/policies', async (req, res, next) => {
    try {
      const reportid = Number(req.params.reportid);
      const email = String(req.query.email || '').trim();

      if (!Number.isFinite(reportid)) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'reportid(number) is required' },
        });
      }

      const { sttRepo, welfarePolicyRepo } = container.repos(req);

      const result = await container.usecases.ensurePolicyRecommendations.execute({
        reportid,
        email: email || null,
        sttRepo,
        welfarePolicyRepo,
      });

      if (result.status === 'PENDING') return res.status(202).json({ ok: true, ...result });
      if (result.status === 'FAILED') return res.status(500).json({ ok: false, error: result.error });
      return res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  // AI module direct run (no DB)
  // POST /core/api/ai/run
  // Body: { transcript?: string, mode?: 'summary'|'policies' }
  router.post('/ai/run', express.json({ limit: '2mb' }), async (req, res, next) => {
    try {
      const mode = String(req.body?.mode || 'summary');
      const transcript = String(req.body?.transcript || '').trim();

      if (!transcript) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'transcript(body) is required' },
        });
      }

      if (mode === 'policies') {
        const policies = await container.aiClient.inferPolicyRecommendations({ transcript });
        return res.json({ ok: true, mode, policies });
      }

      const items = await container.aiClient.inferVisitSummary({ transcript });
      return res.json({ ok: true, mode: 'summary', items });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createApiRouter };
