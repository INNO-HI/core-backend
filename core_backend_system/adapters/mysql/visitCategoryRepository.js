class MysqlVisitCategoryRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async findByReportIdAndEmail(reportid, email) {
    const [rows] = await this.pool.query(
      `SELECT id, category_title, summary_text, detail_text
         FROM VisitCategory
        WHERE report_id = ? AND email = ?
        ORDER BY id ASC`,
      [reportid, email]
    );

    return rows || [];
  }

  async replaceAll(reportid, email, items) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(`DELETE FROM VisitCategory WHERE report_id = ? AND email = ?`, [reportid, email]);

      const sql = `
        INSERT INTO VisitCategory (report_id, email, category_title, summary_text, detail_text)
        VALUES (?, ?, ?, ?, ?)
      `;

      for (const it of items) {
        await conn.query(sql, [
          reportid,
          email,
          it.subject ?? it.category_title ?? '',
          it.abstract ?? it.summary_text ?? '',
          it.detail ?? it.detail_text ?? '',
        ]);
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  }
}

module.exports = { MysqlVisitCategoryRepository };
