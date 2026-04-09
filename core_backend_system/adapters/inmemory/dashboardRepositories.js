/**
 * In-Memory Dashboard Repository (Adapter 레이어)
 *
 * DB 연동 전까지 사용하는 인메모리 mock 어댑터.
 * 프론트엔드의 mock-data와 동일한 데이터를 제공.
 *
 * DB 연동 시 이 파일을 adapters/mysql/dashboardRepository.js로 교체.
 */

// ============================================================
// Mock 데이터
// ============================================================

const mockDashboardKPI = {
  todayVisits: { title: '오늘 방문', value: 24, change: 3, changeDirection: 'up', progressColor: 'blue', progressPercent: 75 },
  pendingReports: { title: '대기 중 보고서', value: 12, change: -2, changeDirection: 'down', progressColor: 'yellow', progressPercent: 30 },
  approvedCount: { title: '승인 완료', value: 156, change: 8, changeDirection: 'up', progressColor: 'green', progressPercent: 90 },
  totalRecipients: { title: '담당 대상자', value: 892, change: 0, changeDirection: 'none', progressColor: 'purple', progressPercent: 100 },
};

const mockRecentReports = [
  { id: 'rpt-001', recipientName: '이복동 어르신', managerName: '이영희', registeredAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), status: 'urgent', isUrgent: true },
  { id: 'rpt-002', recipientName: '김철수 어르신', managerName: '박지민', registeredAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(), status: 'pending', isUrgent: false },
  { id: 'rpt-003', recipientName: '박영희 어르신', managerName: '김민수', registeredAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), status: 'pending', isUrgent: false },
  { id: 'rpt-004', recipientName: '최순자 어르신', managerName: '이영희', registeredAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(), status: 'approved', isUrgent: false },
  { id: 'rpt-005', recipientName: '정만복 어르신', managerName: '최서윤', registeredAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), status: 'approved', isUrgent: false },
];

const mockNotifications = [
  { id: 'notif-001', title: '긴급 보고서 접수', content: '이복동 어르신 보고서가 긴급으로 접수되었습니다.', createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(), isUrgent: true, link: '/care-logs?status=urgent', icon: 'warning' },
  { id: 'notif-002', title: '보고서 승인 요청', content: '3건의 새로운 보고서가 승인 대기 중입니다.', createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(), isUrgent: false, link: '/care-logs?status=pending', icon: 'report' },
  { id: 'notif-003', title: '신규 대상자 등록', content: '목동 3동에 2명의 신규 대상자가 등록되었습니다.', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), isUrgent: false, link: '/recipients', icon: 'info' },
  { id: 'notif-004', title: '월간 보고서 완료', content: '12월 월간 보고서가 정상적으로 생성되었습니다.', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), isUrgent: false, icon: 'success' },
];

const mockWelfareNews = [
  { id: 'welfare-001', title: '2026 상반기 복지 서비스 개편', description: '독거노인 방문 횟수 월 8회로 확대', tag: '신규', date: '2026.03.15' },
  { id: 'welfare-002', title: '노인 맞춤 돌봄 교육 지원 확대', description: '치매 예방 프로그램 비용 지원 강화', tag: '업데이트', date: '2026.03.12' },
  { id: 'welfare-003', title: '기초생활수급자 의료급여 변경', description: '본인부담금 경감 적용 대상 확대', tag: '정책', date: '2026.03.08' },
];

const mockTasks = [
  { id: 'cl-001', title: '이복동 어르신 대상자 돌봄 보고', meta: '이영희 매니저 · 2026-01-04', badge: '긴급', badgeColor: '#EF4444', badgeBg: '#FEE2E2' },
  { id: 'cl-002', title: '박순자 어르신 대상자 돌봄 보고', meta: '박지민 매니저 · 2026-01-04', badge: '처리 중', badgeColor: '#D97706', badgeBg: '#FEF3C7' },
  { id: 'cl-004', title: '김철수 어르신 대상자 돌봄 보고', meta: '김민수 매니저 · 2026-01-03', badge: '처리 중', badgeColor: '#D97706', badgeBg: '#FEF3C7' },
];

const mockNotices = [
  { id: 'notice-001', title: '4월 전체 매니저 회의 안내', date: '2026.03.15', isNew: true },
  { id: 'notice-002', title: '돌봄 기록 시스템 업데이트 안내', date: '2026.03.12', isNew: false },
  { id: 'notice-003', title: '2026 상반기 교육 일정 공지', date: '2026.03.08', isNew: false },
];

class InMemoryDashboardRepo {
  async getKPI() { return mockDashboardKPI; }
  async getRecentReports(limit) { return mockRecentReports.slice(0, limit); }
  async getNotifications(limit) { return mockNotifications.slice(0, limit); }
  async getWelfareNews(limit) { return mockWelfareNews.slice(0, limit); }
  async getTasks(limit) { return mockTasks.slice(0, limit); }
  async getNotices(limit) { return mockNotices.slice(0, limit); }
}

// ============================================================
// 돌봄 일지
// ============================================================

const careLogStatuses = ['urgent', 'pending', 'approved', 'rejected'];
const managerNames = ['이영희', '박지민', '김민수', '최서윤'];
const centerNames = ['목동돌봄센터', '신정돌봄센터', '신월돌봄센터'];

function generateCareLogs() {
  const logs = [];

  // 긴급 3건
  for (let i = 0; i < 3; i++) {
    logs.push({
      id: `cl-${String(i + 1).padStart(3, '0')}`,
      recipientName: ['이복동 어르신', '박순자 어르신', '김만복 어르신'][i],
      managerName: managerNames[i % 4],
      centerName: centerNames[i % 3],
      visitDate: new Date(Date.now() - 1000 * 60 * 60 * (i + 2)).toISOString(),
      registeredAt: new Date(Date.now() - 1000 * 60 * (15 + i * 15)).toISOString(),
      status: 'urgent',
    });
  }
  // 대기 12건
  for (let i = 0; i < 12; i++) {
    logs.push({
      id: `cl-${String(i + 4).padStart(3, '0')}`,
      recipientName: `${['김', '박', '정', '한', '오', '윤', '송', '강', '임', '조', '황', '배'][i]}${['철수', '영희', '순희', '명숙', '정자', '봉수', '복례', '순덕', '말순', '옥분', '점순', '순임'][i]} 어르신`,
      managerName: managerNames[i % 4],
      centerName: centerNames[i % 3],
      visitDate: new Date(Date.now() - 1000 * 60 * 60 * (3 + i * 2)).toISOString(),
      registeredAt: new Date(Date.now() - 1000 * 60 * 60 * (i + 1)).toISOString(),
      status: 'pending',
    });
  }
  // 승인 20건
  for (let i = 0; i < 20; i++) {
    logs.push({
      id: `cl-${String(i + 16).padStart(3, '0')}`,
      recipientName: `${['최', '정', '김', '박', '이', '한', '오', '신', '강', '임', '조', '황', '배', '서', '권', '양', '손', '노', '하', '전'][i]}${['순자', '만복', '영자', '복순', '춘자', '금순', '말자', '복남', '영옥', '순옥', '복자', '말순', '영순', '점순', '순자', '복순', '영희', '순덕', '복례', '말자'][i]} 어르신`,
      managerName: managerNames[i % 4],
      centerName: centerNames[i % 3],
      visitDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * (i + 1)).toISOString(),
      registeredAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * (i + 1) + 1000 * 60 * 60 * 2).toISOString(),
      status: 'approved',
    });
  }
  // 반려 7건
  for (let i = 0; i < 7; i++) {
    logs.push({
      id: `cl-${String(i + 36).padStart(3, '0')}`,
      recipientName: `${['문', '장', '유', '안', '홍', '고', '류'][i]}${['순자', '복자', '말순', '점순', '복녀', '순희', '영자'][i]} 어르신`,
      managerName: managerNames[i % 4],
      centerName: centerNames[i % 3],
      visitDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * (i + 5)).toISOString(),
      registeredAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * (i + 4)).toISOString(),
      status: 'rejected',
    });
  }

  return logs;
}

const allCareLogs = generateCareLogs();

// 돌봄 일지 상세
const careLogDetails = {
  'cl-001': {
    id: 'cl-001', recipientId: 'rec-0001', recipientName: '이복동 어르신', status: 'pending',
    createdAt: '2025-01-04T10:30:00.000Z',
    visitInfo: { visitDate: '2025-01-04T10:30:00.000Z', visitType: 'visit', managerName: '이영희', centerName: '목동종합사회복지관' },
    visitLocation: '서울시 양천구 목동서로 225, 목동아파트 103동 1502호',
    careContent: {
      healthStatus: { status: 'good', label: '양호', description: '혈압 정상, 컨디션 좋음' },
      mealStatus: { status: 'normal', label: '보통', description: '식사량 평소의 80%' },
      emotionalStatus: { status: 'good', label: '양호', description: '밝은 표정, 대화 적극적' },
      livingEnvironment: { status: 'good', label: '양호', description: '청결 상태 양호' },
    },
    careContentBlocks: [
      { title: '건강 상태 확인', content: '어르신께서 최근 며칠간 식사량이 줄었다고 하셨습니다. 혈압 측정 결과 145/92mmHg로 평소보다 다소 높게 측정되었습니다.' },
      { title: '생활 환경 점검', content: '거실 및 화장실 조명이 어두워 낙상 위험이 있어 보입니다.' },
      { title: '정서 상태', content: '최근 외출을 거의 하지 않으시고 무기력한 모습을 보이셨습니다.' },
    ],
    requiredActions: [
      { id: 'action-1', priority: 'urgent', content: '혈압 상승 및 어지러움 증상 - 병원 진료 권유 필요' },
      { id: 'action-2', priority: 'warning', content: '거실/화장실 조명 교체 - 낙상 예방 조치 필요' },
      { id: 'action-3', priority: 'normal', content: '사회적 고립감 해소를 위한 프로그램 연계 검토' },
    ],
    recommendedPolicies: [
      { id: 'policy-1', name: '노인 무료 건강검진', organization: '양천구 보건소 주관', schedule: '매월 둘째, 넷째 주 화요일' },
      { id: 'policy-2', name: '어르신 행복나눔 프로그램', organization: '목동종합사회복지관', schedule: '매주 수요일, 금요일 오후 2시' },
    ],
    feedbacks: [
      { id: 'fb-1', careLogId: 'cl-001', authorId: 'admin-1', authorName: '김담당', authorRole: '구청', content: '혈압 수치가 높네요. 병원 방문 여부를 추적 관찰해주세요.', createdAt: '2025-01-03T14:30:00.000Z' },
    ],
    notes: '다음 방문 시 손자 결혼 이야기 들어드리기로 함.',
    photos: ['/mock-images/care-log-1-1.jpg'],
  },
};

class InMemoryCareLogRepo {
  async getCareLogs(filters, page, pageSize) {
    let logs = [...allCareLogs];

    if (filters.status !== 'all') logs = logs.filter((l) => l.status === filters.status);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      logs = logs.filter((l) => l.recipientName.toLowerCase().includes(s) || l.managerName.toLowerCase().includes(s) || l.centerName.toLowerCase().includes(s));
    }
    if (filters.dateStart) logs = logs.filter((l) => new Date(l.visitDate) >= new Date(filters.dateStart));
    if (filters.dateEnd) logs = logs.filter((l) => new Date(l.visitDate) <= new Date(filters.dateEnd));

    // 상태별 카운트 (전체 데이터 기준)
    const statusCounts = { all: allCareLogs.length, pending: 0, urgent: 0, approved: 0, rejected: 0 };
    for (const l of allCareLogs) statusCounts[l.status]++;

    const totalCount = logs.length;
    const start = (page - 1) * pageSize;
    const paginatedLogs = logs.slice(start, start + pageSize);

    return { logs: paginatedLogs, totalCount, statusCounts };
  }

  async getCareLogById(id) {
    return careLogDetails[id] || allCareLogs.find((l) => l.id === id) || null;
  }

  async updateBulkStatus(ids, status) {
    for (const log of allCareLogs) {
      if (ids.includes(log.id)) log.status = status;
    }
    return { success: true, count: ids.length };
  }

  async updateStatus(id, status, reason) {
    const log = allCareLogs.find((l) => l.id === id);
    if (log) log.status = status;
    if (careLogDetails[id]) {
      careLogDetails[id].status = status;
      if (reason) careLogDetails[id].rejectionReason = reason;
    }
    return { success: true, id, newStatus: status };
  }

  async addFeedback(careLogId, content) {
    const fb = {
      id: `fb-${Date.now()}`,
      careLogId,
      authorId: 'admin-current',
      authorName: '김담당',
      authorRole: '구청',
      content,
      createdAt: new Date().toISOString(),
    };
    if (careLogDetails[careLogId]) {
      careLogDetails[careLogId].feedbacks = careLogDetails[careLogId].feedbacks || [];
      careLogDetails[careLogId].feedbacks.push(fb);
    }
    return fb;
  }
}

// ============================================================
// 매니저
// ============================================================

const dongs = ['목동 1동', '목동 2동', '목동 3동', '목동 4동', '목동 5동', '신정동', '신월동'];
const centers = ['목동종합사회복지관', '신정사회복지관', '신월복지센터', '양천구노인복지관', '양천구종합사회복지관'];

function generateManagers() {
  const mgrNames = [
    { name: '김민수', gender: 'male' }, { name: '이영희', gender: 'female' }, { name: '박지민', gender: 'female' },
    { name: '최서윤', gender: 'female' }, { name: '정수진', gender: 'female' }, { name: '강동훈', gender: 'male' },
    { name: '조미영', gender: 'female' }, { name: '윤성호', gender: 'male' }, { name: '장현주', gender: 'female' },
    { name: '임재현', gender: 'male' },
  ];
  const statuses = ['active', 'active', 'active', 'leave', 'retired'];
  const mgrs = [];

  for (let i = 0; i < 23; i++) {
    const info = mgrNames[i % mgrNames.length];
    const status = statuses[i % statuses.length];
    mgrs.push({
      id: `mgr-${String(i + 1).padStart(4, '0')}`,
      name: info.name,
      gender: info.gender,
      centerName: centers[i % centers.length],
      phone: `010-${String(1000 + i).slice(-4)}-${String(5000 + i).slice(-4)}`,
      assignedDongs: dongs.slice(0, 1 + (i % 3)),
      recipientCount: status === 'retired' ? 0 : 5 + (i * 3) % 20,
      monthlyVisits: status === 'retired' ? 0 : 10 + (i * 7) % 50,
      status,
    });
  }
  return mgrs;
}

const allManagers = generateManagers();

class InMemoryManagerRepo {
  async getManagers(filters) {
    let mgrs = [...allManagers];
    if (filters.status !== 'all') mgrs = mgrs.filter((m) => m.status === filters.status);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      mgrs = mgrs.filter((m) => m.name.toLowerCase().includes(s));
    }
    if (filters.dong !== 'all') mgrs = mgrs.filter((m) => m.assignedDongs.includes(filters.dong));
    if (filters.center !== 'all') mgrs = mgrs.filter((m) => m.centerName === filters.center);

    const statusCounts = { all: allManagers.length, active: 0, leave: 0, retired: 0 };
    for (const m of allManagers) statusCounts[m.status]++;

    return { managers: mgrs, totalCount: mgrs.length, statusCounts };
  }

  async getKPIs() {
    return { total: 23, active: 18, leave: 3, retired: 2 };
  }

  async getManagerById(id) {
    const m = allManagers.find((mg) => mg.id === id);
    if (!m) return null;
    return {
      ...m,
      email: `${m.name.replace(/\s/g, '')}@safehi.kr`,
      startDate: '2023-03-15',
      stats: { monthlyVisits: m.monthlyVisits, monthlyReports: Math.floor(m.monthlyVisits * 0.9), approvalRate: 90, totalRecipients: m.recipientCount },
      recentReports: [],
      recentVisits: [],
      totalVisits: 245,
      reportCounts: { approved: 42, pending: 3, rejected: 2 },
      assignedRecipients: [],
      monthlyActivities: [],
    };
  }

  async getManagerReports(managerId, filters = {}) {
    const manager = allManagers.find((item) => item.id === managerId);
    if (!manager) {
      return { reports: [], totalCount: 0, statusCounts: { all: 0, pending: 0, approved: 0, rejected: 0 } };
    }

    let reports = allCareLogs
      .filter((log) => log.managerName === manager.name)
      .map((log) => ({
        id: log.id,
        recipientId: `rec-${log.id.slice(-3).padStart(4, '0')}`,
        recipientName: log.recipientName,
        visitDate: log.visitDate,
        registeredAt: log.registeredAt,
        status: log.status,
      }));

    if (filters.status && filters.status !== 'all') {
      reports = reports.filter((report) => report.status === filters.status);
    }
    if (filters.dateStart) {
      reports = reports.filter((report) => new Date(report.visitDate) >= new Date(filters.dateStart));
    }
    if (filters.dateEnd) {
      reports = reports.filter((report) => new Date(report.visitDate) <= new Date(filters.dateEnd));
    }

    const baseReports = allCareLogs.filter((log) => log.managerName === manager.name);
    const statusCounts = { all: baseReports.length, pending: 0, approved: 0, rejected: 0 };
    for (const report of baseReports) {
      if (statusCounts[report.status] !== undefined) {
        statusCounts[report.status]++;
      }
    }

    return {
      reports,
      totalCount: reports.length,
      statusCounts,
    };
  }

  async getManagerVisits(managerId, filters = {}) {
    const manager = allManagers.find((item) => item.id === managerId);
    if (!manager) {
      return { visits: [], totalCount: 0, typeCounts: { all: 0, regular: 0, emergency: 0, call: 0 } };
    }

    let visits = mockVisits
      .filter((visit) => visit.managerName === manager.name)
      .map((visit) => {
        const recipient = allRecipients.find((item) => item.id === visit.recipientId);
        return {
          id: visit.id,
          recipientId: visit.recipientId,
          recipientName: recipient?.name || '알 수 없음',
          recipientPhone: recipient?.basicInfo?.phone || recipient?.phone || '',
          recipientAddress: recipient?.address || '',
          recipientStatus: recipient?.status || 'normal',
          visitDate: visit.visitDate,
          visitType: visit.visitType === 'visit' ? 'regular' : visit.visitType,
          result: visit.summary || '방문 완료',
        };
      });

    if (filters.visitType && filters.visitType !== 'all') {
      visits = visits.filter((visit) => visit.visitType === filters.visitType);
    }
    if (filters.search) {
      const keyword = filters.search.toLowerCase();
      visits = visits.filter((visit) => visit.recipientName.toLowerCase().includes(keyword));
    }
    if (filters.dateStart) {
      visits = visits.filter((visit) => new Date(visit.visitDate) >= new Date(filters.dateStart));
    }
    if (filters.dateEnd) {
      visits = visits.filter((visit) => new Date(visit.visitDate) <= new Date(filters.dateEnd));
    }

    const baseVisits = mockVisits.filter((visit) => visit.managerName === manager.name);
    const typeCounts = {
      all: baseVisits.length,
      regular: baseVisits.filter((visit) => visit.visitType === 'visit').length,
      emergency: baseVisits.filter((visit) => visit.visitType === 'emergency').length,
      call: baseVisits.filter((visit) => visit.visitType === 'call').length,
    };

    return {
      visits,
      totalCount: visits.length,
      typeCounts,
    };
  }
}

// ============================================================
// 대상자
// ============================================================

const recipientNames = ['김복동', '이순자', '박영희', '최철수', '정만복', '강순희', '조말순', '윤점순', '장복녀', '임영자'];
const recipientStatuses = ['normal', 'caution', 'urgent', 'unvisited'];

function generateRecipients() {
  const fixedRecipients = [
    { id: 'rec-0001', name: '김복동 어르신', age: 78, gender: 'female', dong: '목동 5동', address: '목동아파트 103동 502호', managerName: '김민수', lastVisitDate: '2026-01-12T09:00:00.000Z', visitCount: 64, status: 'normal' },
    { id: 'rec-0002', name: '이순자 어르신', age: 82, gender: 'male', dong: '신정동', address: '신정아파트 201동 1203호', managerName: '이영희', lastVisitDate: '2026-01-12T10:30:00.000Z', visitCount: 64, status: 'urgent' },
    { id: 'rec-0003', name: '박영희 어르신', age: 75, gender: 'female', dong: '목동 3동', address: '목동빌라 B동 301호', managerName: '박지민', lastVisitDate: '2026-01-11T14:00:00.000Z', visitCount: 42, status: 'normal' },
    { id: 'rec-0004', name: '최철수 어르신', age: 80, gender: 'male', dong: '신월동', address: '신월아파트 105동 801호', managerName: '김민수', lastVisitDate: '2026-01-10T15:00:00.000Z', visitCount: 38, status: 'caution' },
    { id: 'rec-0005', name: '정만복 어르신', age: 72, gender: 'female', dong: '목동 7동', address: '현대아파트 501동 403호', managerName: '이영희', lastVisitDate: null, visitCount: 0, status: 'unvisited' },
  ];
  const recs = [...fixedRecipients];
  for (let i = 6; i <= 50; i++) {
    recs.push({
      id: `rec-${String(i).padStart(4, '0')}`,
      name: `${recipientNames[i % recipientNames.length]} 어르신`,
      age: 65 + (i % 30),
      gender: i % 3 === 0 ? 'male' : 'female',
      dong: dongs[i % dongs.length],
      address: `테스트 주소 ${i}`,
      managerName: managerNames[i % managerNames.length],
      lastVisitDate: recipientStatuses[i % 4] === 'unvisited' ? null : new Date(Date.now() - 1000 * 60 * 60 * 24 * (i % 14)).toISOString(),
      visitCount: recipientStatuses[i % 4] === 'unvisited' ? 0 : 1 + (i % 30),
      status: recipientStatuses[i % 4],
    });
  }
  return recs;
}

const allRecipients = generateRecipients();

// 대상자 상세
const recipientDetails = {
  'rec-0001': {
    id: 'rec-0001', name: '김복동 어르신', age: 78, gender: 'female', status: 'normal',
    basicInfo: { address: '서울시 양천구 목동 5동 목동아파트 103동 502호', dong: '목동 5동', phone: '010-1234-5678', emergencyContact: { name: '박철수', relationship: '아들', phone: '010-9876-5432' } },
    manager: { id: 'm1', name: '김민수', phone: '010-1111-2222', centerName: '양천구 노인복지센터' },
    healthInfo: { diseases: ['고혈압', '당뇨'], medications: ['혈압약 (아침)', '당뇨약 (아침, 저녁)'], notes: '계단 이동 시 숨이 차다고 호소.' },
    recentVisits: [],
    careStartDate: '2024-05-15',
    kpi: { monthlyVisits: 8, totalVisits: 64, totalReports: 64, urgentHistory: 1 },
    memos: [{ id: 'memo-1', recipientId: 'rec-0001', authorId: 'admin-1', authorName: '김담당', content: '혼자 외출 시 낙상 위험 있음.', createdAt: '2024-12-15', type: 'warning' }],
    monthlyVisits: [{ month: '8월', count: 6 }, { month: '9월', count: 8 }, { month: '10월', count: 7 }, { month: '11월', count: 8 }, { month: '12월', count: 7 }, { month: '1월', count: 8 }],
    policyRecommendations: [
      { id: 'pr-1', name: '노인 만성질환 관리 지원', description: '월 최대 10만원 의료비 지원', icon: 'health', badge: '적합' },
      { id: 'pr-2', name: '독거노인 응급안전서비스', description: '24시간 응급 호출 시스템 설치', icon: 'safety', badge: '추천' },
    ],
  },
};

class InMemoryRecipientRepo {
  async getRecipients(filters) {
    let recs = [...allRecipients];
    if (filters.status !== 'all') recs = recs.filter((r) => r.status === filters.status);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      recs = recs.filter((r) => r.name.toLowerCase().includes(s) || r.address.toLowerCase().includes(s) || r.dong.toLowerCase().includes(s));
    }
    if (filters.dong !== 'all') recs = recs.filter((r) => r.dong === filters.dong);
    if (filters.manager !== 'all') recs = recs.filter((r) => r.managerName === filters.manager);

    const statusCounts = { all: allRecipients.length, normal: 0, caution: 0, urgent: 0, unvisited: 0 };
    for (const r of allRecipients) statusCounts[r.status]++;

    return { recipients: recs, totalCount: recs.length, statusCounts };
  }

  async getKPIs() {
    return { total: 892, normal: 624, caution: 134, urgent: 45, unvisited: 89 };
  }

  async getRecipientById(id) {
    return recipientDetails[id] || allRecipients.find((r) => r.id === id) || null;
  }
}

// ============================================================
// 방문 기록
// ============================================================

const mockVisits = [
  { id: 'visit-001', recipientId: 'rec-0001', careLogId: 'cl-001', visitDate: '2026-01-12T09:00:00.000Z', visitType: 'visit', managerName: '김민수', summary: '건강 상태 양호, 식사량 보통' },
  { id: 'visit-002', recipientId: 'rec-0001', careLogId: 'cl-005', visitDate: '2026-01-10T10:00:00.000Z', visitType: 'call', managerName: '김민수', summary: '안부 전화, 특이사항 없음' },
  { id: 'visit-003', recipientId: 'rec-0001', careLogId: 'cl-008', visitDate: '2026-01-08T09:30:00.000Z', visitType: 'visit', managerName: '김민수', summary: '정기 방문, 혈압 측정 완료' },
  { id: 'visit-006', recipientId: 'rec-0002', careLogId: 'cl-002', visitDate: '2026-01-12T10:30:00.000Z', visitType: 'visit', managerName: '이영희', summary: '긴급: 건강 악화, 병원 동행 필요' },
  { id: 'visit-013', recipientId: 'rec-0004', careLogId: 'cl-004', visitDate: '2026-01-10T15:00:00.000Z', visitType: 'visit', managerName: '김민수', summary: '정기 방문, 청소 필요 확인' },
];

class InMemoryVisitRepo {
  async getVisitsByRecipientId(recipientId, filters) {
    let visits = mockVisits.filter((v) => v.recipientId === recipientId);
    if (filters.dateStart) visits = visits.filter((v) => new Date(v.visitDate) >= new Date(filters.dateStart));
    if (filters.dateEnd) visits = visits.filter((v) => new Date(v.visitDate) <= new Date(filters.dateEnd));
    return visits.sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate));
  }

  async createVisitForManager(managerId, data) {
    const manager = allManagers.find((m) => m.id === managerId);
    const recipient = allRecipients.find((r) => r.id === data.recipientId);
    const newVisit = {
      id: `visit-${Date.now()}`,
      recipientId: data.recipientId,
      recipientName: recipient ? recipient.name : '알 수 없음',
      recipientPhone: '',
      recipientAddress: recipient ? recipient.address : '',
      recipientStatus: recipient ? recipient.status : 'normal',
      managerId,
      managerName: manager ? manager.name : '알 수 없음',
      visitDate: data.visitDate,
      visitType: data.visitType === 'visit' ? 'regular' : (data.visitType || 'regular'),
      result: data.summary || '일정 등록',
    };
    mockVisits.push({ ...newVisit, careLogId: null });
    return newVisit;
  }
}

// ============================================================
// 메모
// ============================================================

const mockMemos = [
  { id: 'memo-001', recipientId: 'rec-0001', authorId: 'manager-001', authorName: '김민수', content: '최근 혈압이 다소 높아져 병원 방문을 권유했습니다.', createdAt: '2026-01-08T14:30:00.000Z' },
  { id: 'memo-002', recipientId: 'rec-0001', authorId: 'manager-001', authorName: '김민수', content: '보호자와 통화 완료.', createdAt: '2026-01-05T10:15:00.000Z' },
  { id: 'memo-004', recipientId: 'rec-0002', authorId: 'manager-002', authorName: '이영희', content: '어르신께서 우울감을 호소하셔서 정서 지원 프로그램 연계를 진행중입니다.', createdAt: '2026-01-09T11:00:00.000Z' },
];

class InMemoryMemoRepo {
  async getMemosByRecipientId(recipientId) {
    return mockMemos.filter((m) => m.recipientId === recipientId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async addMemo(recipientId, content, authorId, authorName) {
    const memo = {
      id: `memo-${Date.now()}`,
      recipientId,
      authorId: authorId || 'manager-001',
      authorName: authorName || '김담당',
      content,
      createdAt: new Date().toISOString(),
    };
    mockMemos.unshift(memo);
    return memo;
  }
}

// ============================================================
// 정책
// ============================================================

const mockPolicies = [
  { id: 'policy-001', name: '노인장기요양보험 방문요양서비스', summary: '장기요양등급을 받은 어르신에게 요양보호사가 가정을 방문하여 지원합니다.', matchScore: 95, applicationMethod: '국민건강보험공단 지사 방문 또는 온라인 신청', details: { description: '노인장기요양보험 제도', eligibility: ['만 65세 이상'], benefits: ['신체활동 지원'], documents: ['장기요양인정신청서'], contactInfo: '1577-1000' } },
  { id: 'policy-002', name: '기초연금', summary: '만 65세 이상 소득하위 70% 어르신에게 매월 연금 지급', matchScore: 88, applicationMethod: '주민센터 방문 또는 복지로 온라인', details: { description: '기초연금 제도', eligibility: ['만 65세 이상'], benefits: ['월 최대 334,810원'], documents: ['신분증'], contactInfo: '129' } },
  { id: 'policy-003', name: '노인돌봄종합서비스', summary: '돌봄이 필요한 노인에게 가사·활동지원 서비스', matchScore: 82, applicationMethod: '주민센터 방문 신청', details: { description: '노인돌봄 서비스', eligibility: ['만 65세 이상'], benefits: ['가사 활동 지원'], documents: ['사회서비스 신청서'], contactInfo: '129' } },
];

class InMemoryPolicyRepo {
  async getPoliciesForRecipient(_recipientId) {
    return [...mockPolicies].sort((a, b) => b.matchScore - a.matchScore);
  }

  async refreshPolicies(_recipientId) {
    return mockPolicies.map((p) => ({
      ...p,
      matchScore: Math.max(50, Math.min(100, p.matchScore + Math.floor(Math.random() * 11) - 5)),
    })).sort((a, b) => b.matchScore - a.matchScore);
  }
}

module.exports = {
  InMemoryDashboardRepo,
  InMemoryCareLogRepo,
  InMemoryManagerRepo,
  InMemoryRecipientRepo,
  InMemoryVisitRepo,
  InMemoryMemoRepo,
  InMemoryPolicyRepo,
};
