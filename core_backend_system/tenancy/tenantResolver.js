function resolveTenantFromReq(req, fallback = 'yangchun') {
  const h = req.headers['x-tenant'];
  const q = req.query?.tenant;
  return (h || q || fallback).toString().trim().toLowerCase();
}

module.exports = { resolveTenantFromReq };
