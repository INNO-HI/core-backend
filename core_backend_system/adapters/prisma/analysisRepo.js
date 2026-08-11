/**
 * PostgreSQL Analysis Repository (Prisma) — ownerId 격리
 *
 * 프론트 main 계보의 심리케어 분석 화면(/analysis) 계약으로
 * risk_queue·risk_assessments·risk_evidence·care_logs 데이터를 서빙한다.
 *
 * - 등급 표기 매핑: 백엔드 urgent → 프론트 emergency (나머지 동일)
 * - 임상 척도(PHQ-9 등) 측정 데이터는 아직 없다 — 빈 시계열로 내려준다.
 *   Mock 으로 채우지 않는다: 존재하지 않는 측정값이 실제 현황으로 보이면
 *   잘못된 조치를 유발할 수 있다 (프론트 analysis.ts 주석과 같은 원칙).
 */

const GRADE_TO_FRONT = {
  urgent: 'emergency',
  alert: 'alert',
  caution: 'caution',
  observe: 'observe',
};

const GRADE_LABELS = {
  emergency: '긴급',
  alert: '경보',
  caution: '주의',
  observe: '관찰',
};

/** 등급별 기본 권고 (규칙 기반 — BACKEND_DB_SPEC.md §3.8 시한 표) */
const GRADE_RECOMMENDATION = {
  emergency: {
    channel: 'visit',
    priority: 'immediate',
    action: '즉시 담당자·보호자에게 알리고 대면으로 상태를 확인하세요',
    protocolClause: '긴급 — 4시간 내 확인 처리',
  },
  alert: {
    channel: 'call',
    priority: 'today',
    action: '오늘 안에 방문하거나 통화로 상태를 확인하세요',
    protocolClause: '경보 — 24시간 내 확인 처리',
  },
};

class PrismaAnalysisRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  _queueInclude() {
    return {
      recipient: {
        include: {
          dong: { select: { name: true } },
          manager: { select: { name: true } },
        },
      },
      assessment: {
        include: {
          evidence: true,
          careLog: { select: { id: true, summary: true, visitDate: true, transcript: true } },
        },
      },
    };
  }

  _toCase(item, now) {
    const grade = GRADE_TO_FRONT[item.grade] || item.grade;
    const r = item.recipient;
    const careLog = item.assessment?.careLog || null;
    return {
      id: item.id,
      recipientId: item.recipientId,
      name: r?.name || '',
      age: r?.age ?? 0,
      gender: r?.gender || 'female',
      dong: r?.dong?.name || '',
      managerName: r?.manager?.name || '',
      grade,
      elapsedMin: Math.max(0, Math.floor((now - item.raisedAt.getTime()) / 60000)),
      slaRemainMin: Math.floor((item.dueAt.getTime() - now) / 60000),
      lastInterviewSummary:
        careLog?.summary || item.assessment?.rationale || '',
      lastInterviewAt: (careLog?.visitDate || item.raisedAt).toISOString(),
      emotionTrend: [], // 측정 데이터 없음 — 비워 둔다
      headline: item.assessment?.rationale || `${GRADE_LABELS[grade] || grade} 판정`,
      unread: !item.acknowledgedAt,
    };
  }

  /** 위기 알림 큐 (화면 1) */
  async listCrisisCases(ownerId, restrictManagerId) {
    const now = Date.now();
    const items = await this.prisma.riskQueue.findMany({
      where: restrictManagerId ? { ownerId, recipient: { managerId: restrictManagerId } } : { ownerId },
      orderBy: [{ acknowledgedAt: { sort: 'asc', nulls: 'first' } }, { dueAt: 'asc' }],
      include: this._queueInclude(),
      take: 200,
    });
    return items.map((i) => this._toCase(i, now));
  }

  /** 위기 케이스 상세 (화면 2) */
  async getCrisisCaseDetail(ownerId, id, restrictManagerId) {
    const item = await this.prisma.riskQueue.findFirst({
      where: restrictManagerId
        ? { id, ownerId, recipient: { managerId: restrictManagerId } }
        : { id, ownerId },
      include: this._queueInclude(),
    });
    if (!item) return null;

    const now = Date.now();
    const base = this._toCase(item, now);
    const assessment = item.assessment;
    const evidence = assessment?.evidence || [];
    const r = item.recipient;

    let ackByName = null;
    if (item.acknowledgedById) {
      const u = await this.prisma.user.findUnique({
        where: { id: item.acknowledgedById },
        select: { name: true },
      });
      ackByName = u?.name || null;
    }

    const analyzedAt = (assessment?.createdAt || item.raisedAt).toISOString();
    const analyzedDate = analyzedAt.split('T')[0];

    // 판정 근거 → AIRationale 매핑
    const signals = evidence.map((e) => ({
      label: e.signal,
      weight: evidence.length > 0 ? Math.round((1 / evidence.length) * 100) / 100 : 1,
      direction: 'risk',
    }));
    const excerpts = evidence
      .filter((e) => e.span)
      .map((e) => ({
        id: e.id,
        date: analyzedDate,
        quote: e.span,
        signal: e.signal,
        highlight: e.grade === 'urgent' || e.grade === 'alert',
      }));
    const guardrails = assessment?.escalated
      ? [
          {
            id: `${assessment.id}-guardrail`,
            date: analyzedDate,
            type: '위기 표현 감지',
            detail: '상담 중 위기 표현이 확인되어 등급이 강제 상향되었습니다',
            severity: base.grade,
          },
        ]
      : [];

    // 등급 기반 기본 권고 (경보 이상) + 확인 처리 이력을 처치 기록으로 연결
    const recommendations = [];
    const recTemplate = GRADE_RECOMMENDATION[base.grade];
    if (recTemplate) {
      recommendations.push({
        id: `${item.id}-rec-1`,
        channel: recTemplate.channel,
        priority: recTemplate.priority,
        action: recTemplate.action,
        reason: assessment?.rationale || base.headline,
        protocolName: '위기 대응 규칙',
        protocolClause: recTemplate.protocolClause,
        treatment: item.acknowledgedAt
          ? {
              id: `${item.id}-treatment-1`,
              recommendationId: `${item.id}-rec-1`,
              decision: 'accepted',
              note: item.ackNote || '',
              by: ackByName || '담당자',
              at: item.acknowledgedAt.toISOString(),
            }
          : null,
      });
    }

    // 케이스 이력
    const timeline = [
      {
        id: `${item.id}-ev-grade`,
        type: 'grade',
        content: `${GRADE_LABELS[base.grade] || base.grade} 등급 판정 — ${assessment?.rationale || ''}`,
        by: assessment ? `규칙 엔진 ${assessment.engineVersion}` : '규칙 엔진',
        at: analyzedAt,
      },
    ];
    if (item.acknowledgedAt) {
      timeline.push({
        id: `${item.id}-ev-ack`,
        type: 'action',
        content: item.ackNote || '확인 처리됨',
        by: ackByName || '담당자',
        at: item.acknowledgedAt.toISOString(),
      });
    }
    timeline.sort((a, b) => new Date(b.at) - new Date(a.at));

    return {
      ...base,
      rationale: {
        grade: base.grade,
        // 규칙 코드의 결정적 판정 — 확률 모델이 아니므로 1.0
        confidence: 1,
        summary: assessment?.rationale || base.headline,
        signals,
        excerpts,
        guardrails,
        model: assessment ? `규칙 엔진 ${assessment.engineVersion}` : '규칙 엔진',
        analyzedAt,
      },
      scales: { phq9: [], ucla: [], kpss10: [], satisfaction: [] },
      recommendations,
      timeline,
      phone: r?.phone || '',
      address: [r?.address, r?.addressDetail].filter(Boolean).join(' '),
      livingStatus: r?.livingAlone === true ? '독거' : r?.livingAlone === false ? '동거' : '',
      careStartDate: r?.careStartDate ? r.careStartDate.toISOString().split('T')[0] : '',
    };
  }
}

module.exports = { PrismaAnalysisRepo };
