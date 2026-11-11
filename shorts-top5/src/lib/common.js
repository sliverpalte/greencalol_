// 공통 유틸: 환경변수, 로그(비밀값 가림), 재시도 fetch, 날짜, 파일 입출력
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

// .env 파일이 있으면 읽는다 (이미 설정된 환경변수는 덮어쓰지 않음)
(function loadDotEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(String(v)));
const env = {
  DRY_RUN: bool(process.env.DRY_RUN, true),
  UPLOAD_ENABLED: bool(process.env.UPLOAD_ENABLED, false),
  TEST_MODE: bool(process.env.TEST_MODE, false),
};

const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'settings.json'), 'utf8'));

// 로그에 비밀값이 섞여 나오지 않도록 가린다
const SECRET_KEYS = ['YOUTUBE_API_KEY', 'YT_CLIENT_SECRET', 'YT_REFRESH_TOKEN', 'YT_CLIENT_ID',
  'IG_ACCESS_TOKEN', 'TIKTOK_ACCESS_TOKEN', 'ANTHROPIC_API_KEY'];
function mask(s) {
  let out = String(s);
  for (const k of SECRET_KEYS) {
    const v = process.env[k];
    if (v && v.length > 4) out = out.split(v).join('***');
  }
  return out.replace(/(key|access_token|refresh_token|client_secret)=([^&\s"]+)/gi, '$1=***');
}

// KST 기준 날짜 (YYYY-MM-DD)
function kstDate(d = new Date()) {
  return new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}
const RUN_DATE = process.env.RUN_DATE || kstDate();

const dataDir = (date = RUN_DATE) => path.join(ROOT, 'data', date);
const outDir = (date = RUN_DATE) => path.join(ROOT, 'output', date);

let logFile = null;
function setLogFile(name) {
  fs.mkdirSync(dataDir(), { recursive: true });
  logFile = path.join(dataDir(), name);
}
function log(...args) {
  const line = `[${new Date().toISOString()}] ` + mask(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  console.log(line);
  if (logFile) fs.appendFileSync(logFile, line + '\n');
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 네트워크·서버 오류(5xx, 429)는 지수 백오프로 재시도. 4xx는 바로 실패.
async function fetchRetry(url, opts = {}, { tries = 4, label = 'request' } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || (res.status < 500 && res.status !== 429)) return res;
      lastErr = new Error(`${label}: HTTP ${res.status} ${mask(await res.text()).slice(0, 300)}`);
    } catch (e) { lastErr = e; }
    const wait = 2000 * 2 ** i;
    log(`  재시도 ${i + 1}/${tries} (${label}) ${wait / 1000}s 후: ${mask(lastErr.message)}`);
    await sleep(wait);
  }
  throw lastErr;
}

async function fetchJson(url, opts, meta) {
  const res = await fetchRetry(url, opts, meta);
  const text = await res.text();
  if (!res.ok) throw new Error(`${meta?.label || 'request'}: HTTP ${res.status} ${mask(text).slice(0, 500)}`);
  return JSON.parse(text);
}

// 실패 시 data/<날짜>/error-report.md 작성
function writeErrorReport(stage, err) {
  const p = path.join(dataDir(), 'error-report.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, `## ${new Date().toISOString()} — ${stage} 실패\n\n\`\`\`\n${mask(err.stack || err)}\n\`\`\`\n\n`);
  log(`오류 보고서 작성: ${path.relative(ROOT, p)}`);
}

async function main(stage, fn) {
  try { await fn(); }
  catch (e) { log(`❌ ${stage} 실패: ${e.message}`); writeErrorReport(stage, e); process.exitCode = 1; }
}

module.exports = { ROOT, env, settings, mask, kstDate, RUN_DATE, dataDir, outDir, setLogFile, log,
  readJson, writeJson, sleep, fetchRetry, fetchJson, writeErrorReport, main };
