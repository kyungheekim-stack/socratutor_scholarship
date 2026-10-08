/**
 * [1회용] 2026-10 신청서 1페이지 개편에 맞춰 관리 시트 수식을 바꾼다. (기록용 사본 — 실행은 Apps Script 편집기에서 1회)
 *
 * - 「-> 신청폼 미러링 한국어 문항」: 웹에서 받는 열(타임스탬프·이름·메일·생년월일·미성년·채널·URL·동의 2개)만 자동,
 *   나머지 열은 직접 입력. 기존 행의 값은 그 자리에 값으로 남긴다.
 * - 「[3] 관리 현황」: A~C, H~M 자동 / D~G(추가 채널 2~4, 계좌 정보)는 직접 입력. 기존 행 값은 값으로 남긴다.
 *   · 시작 행을 [1] 2행부터로 바로잡음 (구조도: 신청폼 n행 → 관리 현황 n+1행)
 *   · H(약관 동의): 「입력 내용 확인」 질문이 없어져 동의 2개만 확인
 *   · K(보호자 시트 행 번호): 전화번호를 받지 않으므로 이름+생년월일로 대조
 * - [1] 신청폼 시트는 건드리지 않는다.
 */
function zzMigrateV2() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const byId = id => ss.getSheets().find(s => s.getSheetId() === id);
  const src = byId(1049153251), mir = byId(1952557098), mg = byId(1086491636);
  const S = "'[1] 신청폼'!";
  const G2 = "'[2] 보호자 동의폼'!";
  const letter = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const colIdx = L => L.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;

  // [1]의 마지막 데이터 행 (타임스탬프 기준)
  const tsv = src.getRange(1, 1, src.getMaxRows(), 1).getValues();
  let n1 = tsv.length; while (n1 > 1 && tsv[n1 - 1][0] === '') n1--;
  const COLS = 28; // A..AB (미러링 범위)
  const snap = n1 > 1 ? src.getRange(2, 1, n1 - 1, COLS).getValues() : [];

  // 안전 확인: [3] N열(최종 계약 검토)에 이미 입력값이 있으면 행이 밀리므로 중단
  const nVals = mg.getRange(3, 14, 200, 1).getValues().flat().filter(v => v !== '' && v !== false);
  if (nVals.length) throw new Error('[3] N열에 입력값이 있어 중단합니다: ' + nVals.length + '건');

  // 백업: 바꾸기 전 두 시트를 숨김 사본으로 남긴다
  const stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd-HHmm');
  [mir, mg].forEach(sh => sh.copyTo(ss).setName('백업_' + stamp + '_' + sh.getName()).hideSheet());

  // ---------- 미러링 시트 ----------
  const AUTO_MIR = ['A', 'B', 'E', 'F', 'H', 'I', 'K', 'Z', 'AA'];
  mir.getRange(2, 1, mir.getMaxRows() - 1, COLS).clearContent();
  for (let c = 0; c < COLS; c++) {
    const L = letter(c);
    const head = mir.getRange(1, c + 1);
    if (AUTO_MIR.includes(L)) {
      mir.getRange(2, c + 1).setFormula('=ARRAYFORMULA(IF(' + S + '$A2:$A="","",' + S + L + '2:' + L + '))');
      head.setNote('자동: [1] 신청폼 ' + L + '열 (웹 신청서)');
    } else {
      if (snap.length) mir.getRange(2, c + 1, snap.length, 1).setValues(snap.map(r => [r[c]]));
      head.setNote('직접 입력 (웹 신청서에서 받지 않는 항목)');
    }
  }

  // ---------- [3] 관리 현황 ----------
  const N = 50499;
  const R = L => S + L + '2:' + L + N;
  const E = S + 'A2:A' + N + '=""';
  const F = {
    A: '=ARRAYFORMULA(IF(' + (E) + ',"",ROW(' + (R('A')) + ')))',
    B: '=ARRAYFORMULA(IF(' + (E) + ',"",' + (R('B')) + '))',
    C: '=ARRAYFORMULA(IF(' + (E) + ',"",' + (R('K')) + '))',
    H: '=ARRAYFORMULA(IF(' + (E) + ',"",IF((' + (R('Z')) + '="同意する")*(' + (R('AA')) + '="同意する"),"O","X")))',
    I: '=ARRAYFORMULA(IF(' + (E) + ',"",IFERROR(LET(ts,' + (R('A')) + ',bd,' + (R('F')) + ',age,YEAR(ts)-YEAR(bd)-(TEXT(ts,"MMDD")<TEXT(bd,"MMDD")),IF((age<13)+(age>22),"대상 외",IF(age<18,"O","X"))),"확인 필요")))',
    J: '=ARRAYFORMULA(IF(' + (E) + ',"",MAP(K3:K50500,LAMBDA(r,IFERROR(IF(AND(INDEX(' + (G2) + 'E:E,r)="同意する",INDEX(' + (G2) + 'F:F,r)="同意する",INDEX(' + (G2) + 'G:G,r)="同意する",INDEX(' + (G2) + 'H:H,r)="同意する",INDEX(' + (G2) + 'J:J,r)="同意する"),"O","X"),"X")))))',
    K: '=ARRAYFORMULA(IF(' + (E) + ',"",MAP(' + (R('B')) + ',' + (R('F')) + ',LAMBDA(nm,bd,IFERROR(XMATCH(TRIM(nm)&"|"&TEXT(bd,"YYYY-MM-DD"),ARRAYFORMULA(TRIM(' + (G2) + 'B2:B50500)&"|"&TEXT(' + (G2) + 'D2:D50500,"YYYY-MM-DD")),0,-1)+1,"미제출")))))',
    L: '=ARRAYFORMULA(IF(' + (E) + ',"",IF(ISNUMBER(K3:K50500),"O",IF(I3:I50500<>"O","-",IF(TODAY()-INT(' + (R('A')) + ')>7,"기한 초과","X")))))',
    M: '=ARRAYFORMULA(IF(' + (E) + ',"",IF(H3:H50500<>"O","N",IF(I3:I50500="X","Y",IF(I3:I50500<>"O","N",IF((J3:J50500="O")*(L3:L50500="O"),"Y","N"))))))',
  };
  mg.getRange(3, 1, mg.getMaxRows() - 2, 13).clearContent(); // A~M (수식·스필 결과만)
  Object.entries(F).forEach(([L, f]) => mg.getRange(3, colIdx(L) + 1).setFormula(f));
  // D~G 직접 입력: 기존 행 값 보존 ([1] L·M·N·Y → [3] D·E·F·G, [1] n행 → [3] n+1행)
  const MANUAL = { D: 'L', E: 'M', F: 'N', G: 'Y' };
  Object.entries(MANUAL).forEach(([to, from]) => {
    if (snap.length) mg.getRange(3, colIdx(to) + 1, snap.length, 1).setValues(snap.map(r => [r[colIdx(from)]]));
    mg.getRange(2, colIdx(to) + 1).setNote('직접 입력 (웹 신청서에서 받지 않는 항목)');
  });
  mg.getRange(2, colIdx('H') + 1).setNote('자동: [1] 신청폼 이용약관·개인정보 동의가 모두 「同意する」이면 O');
  mg.getRange(2, colIdx('K') + 1).setNote('자동: [1]과 [2]의 이름+생년월일을 대조해 보호자 동의서 폼에서 몇 번째 행인지 표시');

  // 사용법 표 문구 갱신
  const tf = (from, to) => mg.createTextFinder(from).replaceAllWith(to);
  tf('3행의 A열 ~ M열에 함수가 기입되어 있음', '3행의 A~C열, H~M열에 함수가 기입되어 있음 (D~G열은 직접 입력)');
  tf('A열 ~ M열은 건드리지 않는 것을 추천합니다', 'A~C열, H~M열은 건드리지 않는 것을 추천합니다');

  // 함수 설명 표 (P열: 'A열'…, Q열: 설명, T열: 사용 함수)
  const DESC = {
    D: '직접 입력 (웹 신청서에서 받지 않는 항목)', E: '직접 입력 (웹 신청서에서 받지 않는 항목)',
    F: '직접 입력 (웹 신청서에서 받지 않는 항목)', G: '직접 입력 (웹 신청서에서 받지 않는 항목)',
    H: '[1] 신청폼 이용약관·개인정보 동의가 모두 同意する이면 O',
    K: '[1]과 [2]의 이름+생년월일을 대조해 보호자 동의서 폼에서 몇 번째 행인지 표시',
  };
  mg.getRange('P20:P45').getValues().forEach((r, i) => {
    const L = String(r[0]).replace('열', '').trim();
    const row = 20 + i;
    if (DESC[L]) mg.getRange(row, 17).setValue(DESC[L]);
    if (F[L]) mg.getRange(row, 20).setValue("'" + F[L]);
    else if (DESC[L]) mg.getRange(row, 20).setValue('-');
  });

  SpreadsheetApp.flush();
  return { lastRowOf1: n1, snapshotRows: snap.length };
}
