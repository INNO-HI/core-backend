/**
 * 메일 발송 (BACKEND_REQUEST §2·§9)
 *
 * SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM 환경변수로 설정한다.
 * 미설정이면 발송하지 않고 서버 로그에만 남긴다 — 코드·토큰을 응답 본문에
 * 담는 일은 어떤 경우에도 하지 않는다 (그게 §2가 지적한 구멍이다).
 */

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'no-reply@safe-hi.xyz';

const isConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let transporter = null;
if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendMail({ to, subject, text }) {
  if (!isConfigured) {
    console.warn(`[mailer] SMTP 미설정 — 발송 생략: to=${to} subject="${subject}"`);
    return { sent: false };
  }
  try {
    await transporter.sendMail({ from: `안심하이 <${SMTP_FROM}>`, to, subject, text });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] 발송 실패:', err.message);
    return { sent: false, error: err.message };
  }
}

async function sendVerificationCode(email, code) {
  return sendMail({
    to: email,
    subject: '[안심하이] 이메일 인증 코드',
    text: `안심하이 이메일 인증 코드는 ${code} 입니다.\n5분 안에 입력해 주세요.\n본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.`,
  });
}

async function sendPasswordResetToken(email, token) {
  return sendMail({
    to: email,
    subject: '[안심하이] 비밀번호 재설정 안내',
    text: `비밀번호 재설정 요청을 받았습니다.\n\n재설정 코드: ${token}\n\n30분 안에 앱 또는 대시보드의 비밀번호 재설정 화면에 위 코드를 입력해 주세요.\n본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다 — 비밀번호는 바뀌지 않습니다.`,
  });
}

module.exports = { sendMail, sendVerificationCode, sendPasswordResetToken, isConfigured };
