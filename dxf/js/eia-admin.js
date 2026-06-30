/**
 * eia-admin.js
 * 환경영향평가 목록 엑셀 업로드 (유형별 전체 교체)
 */

// 칸 이름 후보를 여러 개 둬서, 우리 자체 양식(eia_list_template.xlsx)과 EIASS
// 정보시스템에서 그대로 추출한 "협의통계목록" 원본 엑셀(.xls) 둘 다 가공 없이 그대로
// 인식한다 — 한 행에 여러 후보 헤더가 동시에 있으면 먼저 적힌 걸 우선한다.
const EIA_HEADER_ALIASES = {
  serial_no: ['사업코드'],
  agency_name: ['기관명'],
  project_name: ['사업명'],
  assessment_type_label: ['환경영향평가종류', '구분'],
  consult_type: ['협의구분', '유형'],
  location: ['사업지', '주소'],
  site_area: ['규모(대지면적)', '규모'],
  reply_date: ['회신일'],
  is_public: ['평가서 공개유무'],
  province: ['광역자치단체', '광역'],
  city: ['기초자치단체', '기초'],
  operator_name: ['사업자명', '사업자/계획수립자'],
};

function _eiaPick(row, key) {
  for (const header of EIA_HEADER_ALIASES[key]) {
    if (row[header] !== undefined && row[header] !== '') return row[header];
  }
  return undefined;
}

function _eiaParsePublic(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s.includes('비공개') || s === '무') return false;
  if (s.includes('공개') || s === '유') return true;
  return null;
}

function _eiaParseDate(val) {
  if (val === undefined || val === null || val === '') return null;
  if (val instanceof Date) {
    // toISOString()은 UTC 기준이라 한국(UTC+9)에서는 날짜가 하루 당겨지는 문제가 있어
    // 로컬 날짜 구성요소를 직접 사용한다.
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${val.getFullYear()}-${mm}-${dd}`;
  }
  // EIASS 원본 엑셀은 회신일을 "19980630" 같은 8자리 YYYYMMDD 문자열/숫자로 준다.
  const digits = String(val).trim();
  if (/^\d{8}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (!d) return null;
    const mm = String(d.m).padStart(2, '0');
    const dd = String(d.d).padStart(2, '0');
    return `${d.y}-${mm}-${dd}`;
  }
  const s = String(val).trim();
  return s || null;
}

function parseEiaWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }); // 헤더 텍스트 기준 — 열 순서 무관

  return json.map(row => {
    const mapped = {};
    for (const key of Object.keys(EIA_HEADER_ALIASES)) {
      mapped[key] = _eiaPick(row, key);
    }
    return {
      serial_no: String(mapped.serial_no || '').trim(),
      agency_name: String(mapped.agency_name || '').trim() || null,
      project_name: String(mapped.project_name || '').trim() || null,
      assessment_type_label: String(mapped.assessment_type_label || '').trim() || null,
      consult_type: String(mapped.consult_type || '').trim() || null,
      location: String(mapped.location || '').trim() || null,
      site_area: mapped.site_area === '' || mapped.site_area === undefined ? null : Number(mapped.site_area),
      reply_date: _eiaParseDate(mapped.reply_date),
      is_public: _eiaParsePublic(mapped.is_public),
      province: String(mapped.province || '').trim() || null,
      city: String(mapped.city || '').trim() || null,
      operator_name: String(mapped.operator_name || '').trim() || null,
    };
  });
}

async function _eiaHandleUpload(blockEl) {
  const fileInput = blockEl.querySelector('.eia-file-input');
  const statusEl  = blockEl.querySelector('.eia-upload-status');
  const file = fileInput.files[0];

  if (!file) {
    statusEl.innerHTML = '<p class="status-err">엑셀 파일을 선택하세요.</p>';
    return;
  }
  if (typeof XLSX === 'undefined') {
    statusEl.innerHTML = '<p class="status-err">필요한 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.</p>';
    return;
  }

  statusEl.innerHTML = '<p class="archive-empty">파싱 중...</p>';

  try {
    const buf = await file.arrayBuffer();
    const rows = parseEiaWorkbook(buf);

    // 행마다 평가종류(구분/환경영향평가종류 칸)를 보고 서버가 알아서 분류하므로,
    // 양이 많을 때 한 번에 다 보내지 않고 나눠서 보낸다.
    const CHUNK_SIZE = 1500;
    const inserted_by_type = {};
    let skipped_duplicate = 0, skipped_invalid = 0, regions_registered = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      statusEl.innerHTML = `<p class="archive-empty">업로드 중... (${Math.min(i + CHUNK_SIZE, rows.length)}/${rows.length})</p>`;
      const res = await _adminFetch('/eia-list', {
        method: 'POST',
        body: JSON.stringify({ rows: chunk }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');
      for (const [type, n] of Object.entries(data.inserted_by_type || {})) {
        inserted_by_type[type] = (inserted_by_type[type] || 0) + n;
      }
      skipped_duplicate += data.skipped_duplicate || 0;
      skipped_invalid += data.skipped_invalid || 0;
      regions_registered += data.regions_registered || 0;
    }

    // 누적 방식 — 이미 있는 행(일련번호+기관명+평가종류 일치)은 건드리지 않고 건너뛰고,
    // 새 행만 추가한다.
    const parts = [];
    for (const [type, n] of Object.entries(inserted_by_type)) {
      if (n > 0) parts.push(`${type} ${n}건`);
    }
    if (!parts.length) parts.push('새로 추가된 건 없음');
    if (skipped_duplicate) parts.push(`중복 ${skipped_duplicate}건 건너뜀`);
    if (skipped_invalid)   parts.push(`종류 인식 불가/사업코드 없음 ${skipped_invalid}건 스킵`);
    if (regions_registered) parts.push(`신규 지역 ${regions_registered}건 등록`);
    statusEl.innerHTML = `<p class="status-ok">${parts.join(' · ')}</p>`;
    fileInput.value = '';
  } catch (e) {
    statusEl.innerHTML = `<p class="status-err">${e.message}</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!_ensureAdminAuth()) return;
  document.querySelectorAll('.eia-upload-block').forEach(blockEl => {
    const btn = blockEl.querySelector('.eia-upload-btn');
    btn.addEventListener('click', () => _eiaHandleUpload(blockEl));
  });
});
