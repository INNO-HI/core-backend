const express = require('express');

function createCoreRouter(container) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ ok: true, tenant: container.config.defaultTenant });
  });

  // Summary (polling)
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

      const result = await container.services.ensureSummary.execute({
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

      const result = await container.services.ensurePolicyRecommendations.execute({
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

  return router;
}

module.exports = { createCoreRouter };
