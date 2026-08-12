/**
 * 날짜 필터 경계 — 서비스는 한국시간(KST)으로 하루를 센다.
 *
 * `dateStart`/`dateEnd` 로 'YYYY-MM-DD' 가 들어오는데, 그대로 `new Date()` 에
 * 넣으면 UTC 자정이 된다. 그래서 두 가지가 어긋났다.
 *
 *  - dateEnd 를 오늘로 주면 `lte 오늘 00:00` 이 되어 그날 일정이 거의 다 빠졌다.
 *    앱 홈에서 "오늘 뵐 분들"을 물으면 자정 정각 건 하나만 돌아왔다.
 *  - 한국 오전 8시 방문은 UTC 로 전날 23시라, UTC 자정 기준으로 자르면 전날로 샜다.
 *
 * 날짜만 온 값은 KST 하루의 시작으로 읽고, 끝은 다음 날 시작 직전까지 포함한다.
 * 시각까지 붙은 ISO 문자열은 그대로 존중한다.
 */

const KST_OFFSET = '+09:00';
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** 범위의 시작 경계 (>= 로 쓴다) */
function rangeStart(value) {
  if (DATE_ONLY.test(String(value))) {
    return new Date(`${value}T00:00:00.000${KST_OFFSET}`);
  }
  return new Date(value);
}

/**
 * 범위의 끝 경계 (< 로 쓴다).
 * 날짜만 주면 그날을 통째로 포함하도록 다음 날 00:00 KST 를 돌려준다.
 */
function rangeEndExclusive(value) {
  if (DATE_ONLY.test(String(value))) {
    const start = new Date(`${value}T00:00:00.000${KST_OFFSET}`);
    return new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }
  // 시각까지 지정한 값은 그 순간까지 포함한다 (lt 로 쓰므로 1ms 를 더한다)
  const at = new Date(value);
  return isNaN(at.getTime()) ? at : new Date(at.getTime() + 1);
}

module.exports = { rangeStart, rangeEndExclusive };
