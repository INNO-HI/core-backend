/**
 * 상담 전사문 + 대상자 프로필 → 복지 정책 추천.
 *
 * 정책하이(flareon078/demo-app, 포트 8100)에 묻는다. 그쪽이 지역·연령·가구
 * 필터와 RAG 재정렬을 다 갖고 있어서, 여기서는 **우리가 아는 대상자 정보를
 * 정책하이가 알아듣는 말로 옮겨 주는 것**이 일이다.
 *
 * 처음에는 AI-backend 의 옛 RAG(10002)에 붙였다. 지역 필터가 없어 양천구
 * 어르신께 "고성군 긴급돌봄 SOS센터"가 1위로 왔고, 로컬 LLM 이라 28초가
 * 걸렸다. 정책하이는 7초 안팎에 서울시·전국 정책만 골라 준다.
 *
 * 앱은 이 결과를 상담기록 결과지의 "이어서 연계하면 좋을 복지 서비스" 에 그린다.
 * 예전에는 그 칸이 상수 세 줄이었다 — 누구를 뵈어도 같은 세 가지가 떴다.
 */

const http = require('http');

const POLICY_HOST = process.env.POLICY_HOST || '172.17.0.1';
const POLICY_PORT = Number(process.env.POLICY_PORT || 8100);
const POLICY_PATH = process.env.POLICY_PATH || '/api/recommend';
const POLICY_TIMEOUT_MS = Number(process.env.POLICY_TIMEOUT_MS || 50000);

/** 앱에 돌려줄 최대 개수. 결과지 한 칸에 들어갈 만큼만. */
const RETURN_K = 4;

/**
 * 주소에서 시·도와 시·군·구를 뽑는다.
 *
 * 대상자 주소는 "서울특별시 양천구 신월3동 신월로 88" 꼴이다. 정책하이는
 * 시·도 이름을 그대로 쓰므로("서울특별시") 앞 두 토막을 그대로 준다.
 */
function regionFromAddress(address) {
  const parts = (address || '').toString().trim().split(/\s+/);
  if (!parts[0]) return null;
  const sido = parts[0];
  const sigungu = parts[1] && /(시|군|구)$/.test(parts[1]) ? parts[1] : undefined;
  return { sido, sigungu };
}

/**
 * 나이 → 정책하이 age_group. 60대 이상은 하나로 묶어서 받는다.
 */
function ageGroupOf(age) {
  const a = Number(age);
  if (!Number.isFinite(a)) return undefined;
  if (a >= 60) return '60대 이상';
  const d = Math.floor(a / 10) * 10;
  return d >= 10 ? `${d}대` : undefined;
}

/**
 * 상담 전사문에서 관심사 키워드를 뽑는다.
 *
 * 정책하이는 관심사 문구를 카테고리로 옮긴다("식사" → 생활지원 등). 전사문을
 * 통째로 주면 되지만 길면 잡음이 섞이므로, 상담에서 자주 나오는 신호만
 * 짧은 말로 추린다. 없으면 빈 채로 두고 query 만으로 찾게 한다.
 */
function interestsFromTranscript(text) {
  const t = (text || '').toString();
  const found = [];
  const rules = [
    ['식사지원', /끼니|식사|입맛|영양|밥/],
    ['정서지원', /외로|우울|기분|살아서 뭐|무기력|말수|표정/],
    ['돌봄', /돌봄|안부|혼자|독거|자녀|발길/],
    ['건강', /병원|약|혈압|당뇨|통증|아프|진료|검진/],
    ['수면', /잠|수면|불면/],
    ['안전', /낙상|넘어|응급|위험/],
    ['주거', /집|월세|주거|난방|전기/],
    ['경제', /돈|생계|생활비|소득/],
  ];
  for (const [label, re] of rules) if (re.test(t)) found.push(label);
  return found;
}

function callPolicyHi(body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request(
      {
        hostname: POLICY_HOST,
        port: POLICY_PORT,
        path: POLICY_PATH,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
        timeout: POLICY_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) {
            return reject(new Error(`정책하이 HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            reject(new Error(`정책하이 응답을 읽지 못했습니다: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`정책하이 응답 시간 초과 (${POLICY_TIMEOUT_MS / 1000}s)`));
    });
    req.write(payload);
    req.end();
  });
}

/**
 * @param {object} opts
 * @param {string} opts.transcript 상담 전사문(또는 요약)
 * @param {object} [opts.profile]  { age, gender, livingAlone, diseases[], riskGrade, region(주소) }
 * @param {number} [opts.limit]
 */
async function recommendPolicies({ transcript, profile = {}, limit = RETURN_K } = {}) {
  const text = (transcript || '').toString().trim();
  if (!text) {
    const err = new Error('상담 내용이 비어 있습니다.');
    err.code = 'EMPTY_TRANSCRIPT';
    throw err;
  }

  const region = regionFromAddress(profile.region);
  const ageGroup = ageGroupOf(profile.age);
  const age = Number.isFinite(Number(profile.age)) ? Number(profile.age) : undefined;
  const interests = interestsFromTranscript(text);
  const diseases = Array.isArray(profile.diseases) ? profile.diseases.filter(Boolean) : [];

  // 정책하이가 알아듣는 형태로. 모르는 값은 넣지 않는다 — 빈 값을 넣으면
  // 정책하이가 "없음"으로 읽고 걸러 버릴 수 있다.
  const collected = {
    ...(ageGroup ? { age_group: ageGroup } : {}),
    ...(age !== undefined ? { age } : {}),
    ...(region ? { region_sido: region.sido } : {}),
    ...(region?.sigungu ? { region_sigungu: region.sigungu } : {}),
    // 60대 이상 + 1인가구 → 정책하이가 '독거노인'으로 읽는다
    ...(profile.livingAlone === true ? { household: ['1인가구'] } : {}),
    ...(interests.length ? { interests } : {}),
    // 질환은 상황 문장으로. 정책하이는 situation 도 관심사처럼 훑는다.
    ...(diseases.length ? { situation: `${diseases.join(', ')} 질환이 있음` } : {}),
  };

  const res = await callPolicyHi({
    query: text,
    ...(region ? { region } : {}),
    ...(ageGroup ? { age_group: ageGroup } : {}),
    collected_info: collected,
  });

  const list = Array.isArray(res.policies) ? res.policies : [];
  const items = list.slice(0, limit).map((p) => ({
    id: p.policy_id || '',
    title: p.name || '',
    summary: p.summary || '',
    reason: p.reason || '',
    category: p.category || firstOf(p.categories) || '생활지원',
    themes: Array.isArray(p.categories) ? p.categories : [],
    region: [p.region?.sido, p.region?.sigungu].filter(Boolean).join(' ') || '전국',
    eligibility: p.eligibility || '',
    benefits: p.benefits || '',
    howToApply: p.how_to_apply || '',
    contact: p.contact || '',
    url: p.url || '',
    // 정책하이가 붙여 준 조건 일치 배지("연령 60대 이상 ✓" 등). 앱이 그대로 그린다.
    profileHits: Array.isArray(p.match_points) ? p.match_points.map(String) : [],
    matchScore: Number.isFinite(Number(p.match_score)) ? Number(p.match_score) : null,
    rank: p.rank,
  }));

  return {
    items,
    total: Number(res.total) || list.length,
    filteredByProfile: Boolean(region || ageGroup || profile.livingAlone),
    profileSent: collected,
    engine: 'policy-hi',
    meta: res.meta || null,
  };
}

function firstOf(arr) {
  return Array.isArray(arr) && arr.length ? String(arr[0]) : '';
}

module.exports = { recommendPolicies, regionFromAddress, ageGroupOf, interestsFromTranscript };
