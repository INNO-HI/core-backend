class FlaskAiClient {
  constructor({ baseUrl, timeoutMs = 60000 }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
  }

  async _postJson(path, payload) {
    const url = `${this.baseUrl}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`AI HTTP ${resp.status}: ${text}`);
      }

      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async summarizeVisit({ reportid, email, transcriptPath }) {
    const data = await this._postJson('/v1/infer/visit_summary', {
      report_id: reportid,
      email,
      transcript_path: transcriptPath,
    });

    if (!data || !Array.isArray(data.items)) {
      throw new Error('AI response invalid (items missing)');
    }

    return data.items;
  }

  async inferVisitSummary({ transcript }) {
    const data = await this._postJson('/v1/infer/visit_summary', {
      transcript,
    });

    if (!data || !Array.isArray(data.items)) {
      throw new Error('AI response invalid (items missing)');
    }

    return data.items;
  }

  async recommendPolicies({ reportid, transcriptPath, topK = 3 }) {
    const data = await this._postJson('/v1/infer/policy_recommendations', {
      report_id: reportid,
      transcript_path: transcriptPath,
      top_k: topK,
    });

    if (!data || !Array.isArray(data.policies)) {
      throw new Error('AI response invalid (policies missing)');
    }

    return data.policies;
  }

  async inferPolicyRecommendations({ transcript, topK = 3 }) {
    const data = await this._postJson('/v1/infer/policy_recommendations', {
      transcript,
      top_k: topK,
    });

    if (!data || !Array.isArray(data.policies)) {
      throw new Error('AI response invalid (policies missing)');
    }

    return data.policies;
  }
}

module.exports = { FlaskAiClient };
