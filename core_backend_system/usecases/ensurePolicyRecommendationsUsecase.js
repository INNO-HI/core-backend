class EnsurePolicyRecommendationsUsecase {
  constructor({ aiClient }) {
    this.aiClient = aiClient;
  }

  async execute({ reportid, email, sttRepo, welfarePolicyRepo }) {
    const existing = await welfarePolicyRepo.findByReportId(reportid);
    if (existing.length > 0) {
      return { status: 'READY', reportid, items: existing };
    }

    const transcriptPath = email
      ? await sttRepo.getTranscriptPath(reportid, email)
      : await sttRepo.getTranscriptPathByReportId(reportid);

    if (!transcriptPath) {
      return { status: 'FAILED', error: { code: 'NO_STT', message: 'STT transcript path not found' } };
    }

    const policies = await this.aiClient.recommendPolicies({ reportid, transcriptPath, topK: 3 });
    await welfarePolicyRepo.replaceForReportId(reportid, policies);

    return {
      status: 'PENDING',
      reportid,
      message: 'Policies generated & stored. Retry shortly.',
      retryAfterMs: 800,
    };
  }
}

module.exports = { EnsurePolicyRecommendationsUsecase };
