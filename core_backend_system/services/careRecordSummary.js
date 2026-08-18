/**
 * 상담 전사문 → 상담기록 다섯 섹션.
 *
 * 앱이 녹음을 올리면 STT 서버가 전사문을 돌려주고, 그 전사문을 여기서
 * 정리해 화면에 그대로 뜨는 다섯 덩어리로 만든다.
 *
 * 예전에는 앱이 `CareRecordDraft.sample()` 에 박아 둔 표본 문장을 그렸다.
 * 원문은 "오늘 표정이 어두우셨습니다" 한 줄인데 정리본에는 자녀 이야기와
 * 복약 이야기가 나왔다 — 같은 화면에서 근거와 결과가 어긋났다.
 *
 * 모델은 gpt-5.4 를 기본으로 쓴다. gpt-5.5 는 같은 조건에서 한국어 문장
 * 중간에 깨진 토큰을 섞었다("...하셨습니다다습니섭니다"). 5.4·5.2·4.1 은
 * 같은 입력에서 깨끗했다.
 */

const SECTION_KINDS = ['log', 'notable', 'risk', 'nextVisit', 'followUp'];

const SECTION_TITLES = {
  log: '상담일지',
  notable: '특이사항',
  risk: '확인된 신호',
  nextVisit: '다음 방문계획',
  followUp: '후속조치',
};

const SYSTEM_PROMPT = `너는 노인 돌봄 사회복지사의 상담 기록을 정리하는 보조자다.
상담 녹음을 받아쓴 전사문만 근거로 삼는다.

규칙
- 전사문에 없는 사실을 지어내지 않는다. 근거가 없으면 그 항목을 비운다.
- 단정·진단·미래 예측을 쓰지 않는다. "우울증이다", "위험해질 것이다" 같은 표현 금지.
- 위기 등급을 매기지 않는다. 등급은 규칙 기반 코드가 따로 정한다.
- 관찰한 사실과 지금 필요한 행동만 적는다.
- 어르신을 높여 쓰고, 문장은 "~하셨습니다", "~합니다" 로 끝낸다.
- 한 항목은 한 문장. 길게 늘이지 않는다.
- 주어를 매 문장 반복하지 않는다. 누구 이야기인지 분명하므로
  "어르신께서" 같은 주어는 꼭 필요할 때만 쓴다.
- 한글과 문장부호 외에 다른 문자를 섞지 않는다.

섹션
- log: 상담일지 — 오늘 나눈 이야기와 관찰한 모습
- notable: 특이사항 — 눈에 띄게 달라진 점, 그대로 옮길 만한 말씀
- risk: 확인된 신호 — 위기 판단의 근거가 되는 관찰
- nextVisit: 다음 방문계획 — 다음에 확인할 것
- followUp: 후속조치 — 지금 담당자가 해야 할 일`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sections'],
  properties: {
    sections: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'bullets'],
        properties: {
          kind: { type: 'string', enum: SECTION_KINDS },
          bullets: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 3,
          },
        },
      },
    },
  },
};

/**
 * 한글 상담 문장에 섞이면 안 되는 글자.
 *
 * 모델이 드물게 키릴 문자나 라틴 단어를 문장 끝에 흘린다("...하셨습니다с였습니다").
 * 그대로 기관에 올라가면 기록의 신뢰가 무너지므로 걸러 낸다.
 */
const FOREIGN_CHAR = /[^가-힣㄰-㆏0-9A-Za-z\s.,·“”"'()~\-…?!:/]/;
const BROKEN_ENDING = /(니다){2,}|다습니|습니섭/;

function isClean(sentence) {
  return !FOREIGN_CHAR.test(sentence) && !BROKEN_ENDING.test(sentence);
}

/**
 * 전사문을 다섯 섹션으로 정리한다.
 *
 * @param {object} opts
 * @param {string} opts.transcript 상담 전사문
 * @param {string[]} [opts.tags] 선생님이 고른 특이사항 태그
 * @param {string} [opts.workerGrade] 선생님이 본 등급
 * @returns {Promise<{sections: {kind, title, bullets}[], model: string}>}
 */
async function summarizeCareRecord({
  transcript,
  tags = [],
  workerGrade = '',
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || 'gpt-5.4',
  timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 120000),
} = {}) {
  if (!transcript || !transcript.trim()) {
    const err = new Error('전사문이 비어 있습니다.');
    err.code = 'EMPTY_TRANSCRIPT';
    throw err;
  }
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY 가 설정되지 않았습니다.');
    err.code = 'NO_API_KEY';
    throw err;
  }

  // 선생님이 고른 값은 참고로만 준다. 이것으로 없는 사실을 만들면 안 된다.
  const hints = [];
  if (tags.length) hints.push(`선생님이 고른 특이사항: ${tags.join(', ')}`);
  if (workerGrade) hints.push(`선생님이 본 등급: ${workerGrade}`);
  const hintText = hints.length
    ? `\n\n참고(전사문에 없는 내용을 만들어 내는 근거로 쓰지 말 것):\n${hints.join('\n')}`
    : '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let payload;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `전사문:\n${transcript}${hintText}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'care_record', strict: true, schema: SCHEMA },
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`요약 모델 호출 실패 (HTTP ${res.status}): ${text.slice(0, 200)}`);
      err.code = 'UPSTREAM_ERROR';
      throw err;
    }
    payload = await res.json();
  } finally {
    clearTimeout(timer);
  }

  const content = payload?.choices?.[0]?.message?.content;
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    const err = new Error('요약 결과를 읽지 못했습니다.');
    err.code = 'BAD_MODEL_OUTPUT';
    throw err;
  }

  const byKind = new Map();
  for (const s of parsed.sections || []) {
    if (!SECTION_KINDS.includes(s.kind)) continue;
    const bullets = (s.bullets || [])
      .map((b) => String(b).trim())
      .filter((b) => b.length > 0 && isClean(b));
    if (bullets.length) byKind.set(s.kind, bullets);
  }

  // 화면이 기대하는 순서대로 되돌린다. 내용이 없는 섹션은 넣지 않는다 —
  // 빈 제목만 뜨면 정리에 실패한 것처럼 보인다.
  const sections = SECTION_KINDS.filter((k) => byKind.has(k)).map((k) => ({
    kind: k,
    title: SECTION_TITLES[k],
    bullets: byKind.get(k),
  }));

  if (!sections.length) {
    const err = new Error('요약 결과가 비어 있습니다.');
    err.code = 'EMPTY_SUMMARY';
    throw err;
  }

  return { sections, model: payload.model || model };
}

module.exports = { summarizeCareRecord, SECTION_KINDS, SECTION_TITLES };
