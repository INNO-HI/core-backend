/**
 * 능력(capability) 기반 권한 — dashboard-web docs/PERMISSIONS.md 구현
 *
 * 계정의 실제 권한 = rolePreset(role) + grants − revokes
 * 역할은 고정 묶음이 아니라 기본 프리셋일 뿐이다. 마스터는 계정마다
 * 능력을 낱개로 열고 닫을 수 있다 (users.capabilityGrants JSON).
 */

const ALL_CAPABILITIES = [
  'careLog:approve', // 돌봄 일지 승인·반려
  'careLog:write', // 돌봄 일지 작성
  'recipient:readAssigned', // 담당 대상자 열람
  'recipient:readAll', // 담당 아닌 대상자 열람
  'manager:readAll', // 실무자 명부 열람
  'manager:assign', // 담당 배정·인계
  'crisis:assign', // 위기 케이스 인계
  'stats:readAll', // 전체 통계 열람
  'export:all', // 전체 내보내기
  'account:grant', // 계정별 권한 부여 (마스터 전용)
];

/**
 * 역할별 기본 프리셋 (PERMISSIONS.md §2 능력 표)
 *
 * - institution(관리자): careLog:write 없음 — 쓰면 작성자=승인자가 된다
 * - caregiver(실무자): careLog:approve 없음 — 자기 일지를 자기가 승인하게 된다
 * - user/admin(legacy): 권한 도입 전 계정 — 기존 동작이 깨지지 않도록
 *   account:grant 를 제외한 전 능력을 준다. 조정은 계정별 revoke 로 한다.
 */
const ROLE_PRESETS = {
  master: [...ALL_CAPABILITIES],
  admin: [...ALL_CAPABILITIES], // legacy 관리자 = 마스터급 유지 (기존 계정 관리 화면 호환)
  institution: [
    'careLog:approve',
    'recipient:readAssigned',
    'recipient:readAll',
    'manager:readAll',
    'manager:assign',
    'crisis:assign',
    'stats:readAll',
    'export:all',
  ],
  caregiver: ['careLog:write', 'recipient:readAssigned'],
  user: ALL_CAPABILITIES.filter((c) => c !== 'account:grant'), // legacy 겸용 계정
  none: [],
};

/** users.capabilityGrants JSON 파싱 (없거나 깨졌으면 빈 조정) */
function parseGrants(capabilityGrants) {
  const empty = { grants: [], revokes: [] };
  if (!capabilityGrants || typeof capabilityGrants !== 'object') return empty;
  return {
    grants: Array.isArray(capabilityGrants.grants) ? capabilityGrants.grants : [],
    revokes: Array.isArray(capabilityGrants.revokes) ? capabilityGrants.revokes : [],
  };
}

/** 계정의 실제 능력 목록 계산 */
function resolveCapabilities(user) {
  const preset = ROLE_PRESETS[user?.role] ?? ROLE_PRESETS.none;
  const { grants, revokes } = parseGrants(user?.capabilityGrants);
  const set = new Set(preset);
  for (const g of grants) if (ALL_CAPABILITIES.includes(g)) set.add(g);
  for (const r of revokes) set.delete(r);
  return [...set];
}

function hasCapability(user, capability) {
  return resolveCapabilities(user).includes(capability);
}

module.exports = { ALL_CAPABILITIES, ROLE_PRESETS, parseGrants, resolveCapabilities, hasCapability };
