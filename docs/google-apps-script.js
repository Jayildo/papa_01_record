/**
 * Google Apps Script — 수목 전정 데이터 Google Sheets 백업
 *
 * 사용법:
 * 1. Google Sheets에서 [확장 프로그램] → [Apps Script] 클릭
 * 2. 이 코드를 붙여넣기
 * 3. [배포] → [새 배포] → 유형: "웹 앱"
 *    - 실행 사용자: "나"
 *    - 액세스 권한: "모든 사용자"
 * 4. 배포 후 받는 URL을 Vercel 환경변수에 추가:
 *    VITE_GOOGLE_SHEETS_WEBHOOK_URL = <배포 URL>
 *
 * 구조: 단일 '데이터' 시트에 프로젝트명 컬럼으로 구분
 * 헤더: 프로젝트명 | 순번 | 흉고직경(cm) | 수종 | 위치 | 비고 | 동기화 시각
 */

var SHEET_NAME = '데이터';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var projectName = payload.projectName || '기본';
    var records = payload.records || [];

    var ss = SpreadsheetApp.openById('1iPCE__uKALFDoEA5Bm1LzEmWV5XiZ9Rd0wx4vM_O5Zg');
    var sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['프로젝트명', '순번', '흉고직경(cm)', '수종', '위치', '비고', '동기화 시각']);
      var headerRange = sheet.getRange(1, 1, 1, 7);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#f3f4f6');
    }

    // 해당 프로젝트 기존 행 삭제 (역순으로 삭제해야 인덱스 안 밀림)
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][0] === projectName) {
        sheet.deleteRow(i + 1);
      }
    }

    // 새 데이터 추가
    if (records.length > 0) {
      var rows = records.map(function(r) {
        return [
          projectName,
          r.index,
          r.diameter,
          r.species,
          r.location,
          r.note || '',
          r.timestamp
        ];
      });
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', count: records.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET 요청 시 상태 확인용
function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: '수목 전정 백업 API 정상 작동 중' }))
    .setMimeType(ContentService.MimeType.JSON);
}
