const inMemoryTranscripts = new Map([
  ['1:test@example.com', '/tmp/safehi/report-1-test@example.com.txt'],
  ['1:*', '/tmp/safehi/report-1.txt'],
  ['2:test@example.com', '/tmp/safehi/report-2-test@example.com.txt'],
  ['2:*', '/tmp/safehi/report-2.txt'],
]);

const visitCategoryStore = new Map();
const welfarePolicyStore = new Map();

class InMemoryYangChunSttRepository {
  async getTranscriptPath(reportid, email) {
    return inMemoryTranscripts.get(`${reportid}:${email}`) || inMemoryTranscripts.get(`${reportid}:*`) || null;
  }

  async getTranscriptPathByReportId(reportid) {
    return inMemoryTranscripts.get(`${reportid}:*`) || null;
  }
}

class InMemoryVisitCategoryRepository {
  async findByReportIdAndEmail(reportid, email) {
    return visitCategoryStore.get(`${reportid}:${email}`) || [];
  }

  async replaceAll(reportid, email, items) {
    const normalized = (items || []).map((item, index) => ({
      id: index + 1,
      category_title: item.subject ?? item.category_title ?? '',
      summary_text: item.abstract ?? item.summary_text ?? '',
      detail_text: item.detail ?? item.detail_text ?? '',
    }));

    visitCategoryStore.set(`${reportid}:${email}`, normalized);
  }
}

class InMemoryWelfarePolicyRepository {
  async findByReportId(reportid) {
    return welfarePolicyStore.get(String(reportid)) || [];
  }

  async replaceForReportId(reportid, policies) {
    const normalized = (policies || []).map((policy) => ({
      policy_name: policy.policy_name ?? '',
      short_description: policy.short_description ?? '',
      detailed_conditions: Array.isArray(policy.detailed_conditions)
        ? policy.detailed_conditions
        : [],
      link: policy.link ?? null,
    }));

    welfarePolicyStore.set(String(reportid), normalized);
  }
}

module.exports = {
  InMemoryYangChunSttRepository,
  InMemoryVisitCategoryRepository,
  InMemoryWelfarePolicyRepository,
};
