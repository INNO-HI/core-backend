class EnsureSummaryService {
  constructor({ aiClient }) {
    this.aiClient = aiClient;
  }

  async execute({ reportid, email, sttRepo, visitCategoryRepo }) {
    const existing = await visitCategoryRepo.findByReportIdAndEmail(reportid, email);
    if (existing.length > 0) {
      return {
        status: 'READY',
        reportid,
        email,
        items: existing.map((r) => ({
          subject: r.category_title,
          abstract: r.summary_text,
          detail: r.detail_text,
        })),
      };
    }

    const transcriptPath = await sttRepo.getTranscriptPath(reportid, email);
    if (!transcriptPath) {
      return { status: 'FAILED', error: { code: 'NO_STT', message: 'STT transcript path not found' } };
    }

    const aiItems = await this.aiClient.summarizeVisit({ reportid, email, transcriptPath });
    await visitCategoryRepo.replaceAll(reportid, email, aiItems);

    return {
      status: 'PENDING',
      reportid,
      email,
      message: 'Summary generated & stored. Retry shortly.',
      retryAfterMs: 800,
    };
  }
}

module.exports = { EnsureSummaryService };
