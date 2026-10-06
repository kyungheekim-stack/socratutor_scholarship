/**
 * Socra Tutor 奨学生 応募フォーム → 「[1] 신청폼」 시트 기록용 웹 앱
 *
 * 설치: 스프레드시트 「[Socra Tutor 장학생] 구글폼 통합관리 스프레드시트」 → 확장 프로그램 → Apps Script 에 붙여 넣기
 * 배포: 배포 → 새 배포 → 웹 앱 / 실행 계정: 나 / 액세스 권한: 모든 사용자
 *
 * 열은 순서가 아니라 1행의 열 제목으로 찾는다. 제목이 없는 열은 맨 오른쪽에 자동으로 만든다.
 * 같은 제목이 여러 번 있으면(その他の追加アカウントURL ×3) 왼쪽부터 차례로 채운다.
 */

const SHEET_ID = '1XVf06-WFqs2RzzoTdg4aGxXZkClQ4VWLpEXKsnHAu5A';
const SHEET_GID = 1049153251; // [1] 신청폼

const H = {
  ts: '타임스탬프',
  name: 'お名前（漢字）',
  kana: 'お名前（フリガナ）',
  phone: '電話番号（携帯）',
  email: 'メールアドレス ',
  birth: '生年月日',
  school: '在籍している学校名・学年',
  minor: '申込日時点で満18歳未満ですか？',
  channel: 'コンテンツを投稿する代表アカウントのチャンネル',
  handle: 'コンテンツを投稿する代表アカウントのID',
  accUrl: 'コンテンツを投稿する代表アカウントのURL',
  extra: 'その他の追加アカウントURL（任意）',
  wishlist: '先着特典（学習用書籍）をご希望の方は、Amazonの「ほしい物リスト」共有用URLをご入力ください',
  gName: '保護者のお名前（漢字）',
  gKana: '保護者のお名前（フリガナ）',
  relation: '関係',
  gPhone: '保護者の電話番号（携帯）',
  gEmail: '保護者のメールアドレス ',
  invoice: 'インボイス発行事業者として登録されていますか？',
  sole: '個人事業主として開業届を提出していますか？',
  corp: '法人として活動されていますか？(法人名義でのご契約になりますか？)',
  corpName: '法人名',
  bankAll: 'お振込先の銀行コード、支店コード、口座種別、口座番号、口座名義（カタカナ）をご記入ください',
  agreeTerms: '利用規約および運営ポリシーに同意しますか？',
  agreePrivacy: '個人情報の取扱いおよび外国（韓国・米国）での取扱いについて、同意しますか？',
  confirmed: 'ご入力内容に誤りや記入漏れがないか、ご確認いただけましたか？',
  // ↓ 웹 신청 페이지에서 새로 추가되는 열 (없으면 자동 생성)
  bank: '銀行コード',
  branch: '支店コード',
  accType: '口座種別',
  accNo: '口座番号',
  holder: '口座名義（カタカナ）',
  invoiceNo: 'インボイス登録番号',
  source: '送信元',
};

const MAX_LEN = 500;

function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  // 봇 차단용 숨김 칸(사람은 비워 둠)
  if (d.website) return json_({ ok: true });

  const problems = validate_(d);
  if (problems.length) return json_({ ok: false, error: 'invalid', fields: problems });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    writeRow_(d);
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}

// 동작 확인용: 웹 앱 URL을 브라우저로 열면 {"ok":true,"service":"apply"} 가 보이면 정상
function doGet() {
  return json_({ ok: true, service: 'apply' });
}

function validate_(d) {
  const s = k => String(d[k] == null ? '' : d[k]).trim();
  const bad = [];
  const need = ['name', 'kana', 'phone', 'email', 'school', 'minor', 'channel', 'handle', 'accUrl',
    'invoice', 'sole', 'corp', 'bank', 'branch', 'accType', 'accNo', 'holder'];
  need.forEach(k => { if (!s(k)) bad.push(k); });
  if (s('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s('email'))) bad.push('email');
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(s('birth'))) bad.push('birth');
  if (!/^\d{4}$/.test(s('bank'))) bad.push('bank');
  if (!/^\d{3}$/.test(s('branch'))) bad.push('branch');
  if (!/^\d{7,8}$/.test(s('accNo'))) bad.push('accNo');
  if (s('minor') === 'はい') ['gName', 'gKana', 'relation', 'gPhone', 'gEmail'].forEach(k => { if (!s(k)) bad.push(k); });
  if (d.agreeTerms !== true || d.agreePrivacy !== true || d.confirmed !== true) bad.push('agree');
  Object.keys(d).forEach(k => { if (String(d[k]).length > MAX_LEN) bad.push(k); });
  return [...new Set(bad)];
}

function writeRow_(d) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheets().find(x => x.getSheetId() === SHEET_GID);
  if (!sh) throw new Error('sheet not found');
  const s = k => String(d[k] == null ? '' : d[k]).trim();
  const [y, m, day] = s('birth').split('-').map(Number);
  const minor = s('minor') === 'はい';
  const extras = (Array.isArray(d.extras) ? d.extras : []).map(String).filter(Boolean).slice(0, 3);

  // [열 제목, 값] — 같은 제목은 나오는 순서대로 다음 열에 들어간다
  const cells = [
    [H.ts, new Date()],
    [H.name, s('name')], [H.kana, s('kana')], [H.phone, s('phone')], [H.email, s('email')],
    [H.birth, new Date(y, m - 1, day, 12)], // 정오로 저장 → 스크립트·시트 시간대가 달라도 날짜가 하루 밀리지 않음
    [H.school, s('school')], [H.minor, s('minor')], [H.channel, s('channel')],
    [H.handle, s('handle')], [H.accUrl, s('accUrl')],
    [H.extra, extras[0] || ''], [H.extra, extras[1] || ''], [H.extra, extras[2] || ''],
    [H.wishlist, s('wishlist')],
    [H.gName, minor ? s('gName') : ''], [H.gKana, minor ? s('gKana') : ''], [H.relation, minor ? s('relation') : ''],
    [H.gPhone, minor ? s('gPhone') : ''], [H.gEmail, minor ? s('gEmail') : ''],
    [H.invoice, s('invoice')], [H.sole, s('sole')], [H.corp, s('corp')], [H.corpName, s('corpName')],
    [H.bankAll, [s('bank'), s('branch'), s('accType'), s('accNo'), s('holder')].join(' / ')],
    [H.agreeTerms, '同意する'], [H.agreePrivacy, '同意する'], [H.confirmed, '確認しました'],
    [H.bank, s('bank')], [H.branch, s('branch')], [H.accType, s('accType')], [H.accNo, s('accNo')], [H.holder, s('holder')],
    [H.invoiceNo, s('invoiceNo')],
    [H.source, 'web'],
  ];

  // 열 제목 → 열 번호 목록 (없는 제목은 맨 오른쪽에 추가)
  let lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const need = {};
  cells.forEach(([h]) => { need[h] = (need[h] || 0) + 1; });
  Object.keys(need).forEach(h => {
    const have = headers.filter(x => x === h).length;
    for (let i = have; i < need[h]; i++) {
      headers.push(h);
      sh.getRange(1, headers.length).setValue(h);
    }
  });
  // 열 번호 → [값, 서식]
  const byCol = {};
  const used = {};
  cells.forEach(([h, v]) => {
    const nth = used[h] = (used[h] || 0) + 1;
    for (let i = 0, c = 0; i < headers.length; i++) {
      if (headers[i] === h && ++c === nth) {
        // 문자열은 '@'(텍스트)로 저장 → 0으로 시작하는 전화번호·은행 코드가 숫자로 바뀌지 않게
        byCol[i + 1] = [v, v instanceof Date ? (h === H.ts ? 'yyyy/mm/dd hh:mm:ss' : 'yyyy/mm/dd') : '@'];
        break;
      }
    }
  });

  // 새 행 = 타임스탬프 열의 마지막 값 다음 줄 (다른 열의 수식 결과에 영향받지 않게)
  const tsCol = headers.indexOf(H.ts) + 1;
  const tsVals = sh.getRange(1, tsCol, sh.getMaxRows(), 1).getValues();
  let r = tsVals.length;
  while (r > 1 && tsVals[r - 1][0] === '') r--;
  r += 1;
  if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 1);

  // 우리 열에만 쓴다 (연속된 열끼리 묶어서 기록, 다른 열의 수식은 건드리지 않음)
  const cols = Object.keys(byCol).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < cols.length;) {
    let j = i;
    while (j + 1 < cols.length && cols[j + 1] === cols[j] + 1) j++;
    const run = cols.slice(i, j + 1);
    const range = sh.getRange(r, run[0], 1, run.length);
    range.setNumberFormats([run.map(c => byCol[c][1])]);
    // 표(Form_Responses) 열은 열 형식이 텍스트 서식보다 우선해서 0으로 시작하는 숫자가 잘린다 → 숫자처럼 보이는 값은 ' 를 붙여 텍스트로 고정
    range.setValues([run.map(c => {
      const v = byCol[c][0];
      return typeof v === 'string' && /^[\d.,+\-\/ :]+$/.test(v) ? "'" + v : v;
    })]);
    i = j + 1;
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
