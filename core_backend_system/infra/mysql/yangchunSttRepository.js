class MysqlYangChunSttRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async getTranscriptPath(reportid, email) {
    const [rows] = await this.pool.query(
      `SELECT stt_transcript_path
         FROM YangChun_VisitReport
        WHERE report_id = ? AND email = ?
        LIMIT 1`,
      [reportid, email]
    );
    return rows?.[0]?.stt_transcript_path || null;
  }

  async getTranscriptPathByReportId(reportid) {
    const [rows] = await this.pool.query(
      `SELECT stt_transcript_path
         FROM YangChun_VisitReport
        WHERE report_id = ?
        LIMIT 1`,
      [reportid]
    );
    return rows?.[0]?.stt_transcript_path || null;
  }
}

module.exports = { MysqlYangChunSttRepository };
