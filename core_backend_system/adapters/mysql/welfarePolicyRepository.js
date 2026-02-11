class MysqlWelfarePolicyRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async findByReportId(reportid) {
    const [rows] = await this.pool.query(
      `SELECT policy_id, report_id, policy_name, short_description, detailed_conditions, link
         FROM WelfarePolicies
        WHERE report_id = ?
        ORDER BY policy_id ASC`,
      [reportid]
    );

    return (rows || []).map((r) => ({
      policy_name: r.policy_name,
      short_description: r.short_description || '',
      detailed_conditions: (r.detailed_conditions || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      link: r.link || null,
    }));
  }

  async replaceForReportId(reportid, policies) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(`DELETE FROM WelfarePolicies WHERE report_id = ?`, [reportid]);

      const sql = `
        INSERT INTO WelfarePolicies
          (report_id, age, region, non_duplicative_policies, policy_name, short_description, detailed_conditions, link)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      for (const p of policies) {
        await conn.query(sql, [
          reportid,
          p.age ?? null,
          p.region ?? null,
          Array.isArray(p.non_duplicative_policies)
            ? p.non_duplicative_policies.join(',')
            : (p.non_duplicative_policies ?? null),
          p.policy_name ?? '',
          p.short_description ?? '',
          Array.isArray(p.detailed_conditions) ? p.detailed_conditions.join(',') : (p.detailed_conditions ?? null),
          p.link ?? null,
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

module.exports = { MysqlWelfarePolicyRepository };
