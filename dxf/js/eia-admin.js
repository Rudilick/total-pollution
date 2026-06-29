/**
 * eia-admin.js
 * 환경영향평가 목록 엑셀 업로드 (유형별 전체 교체)
 */

const EIA_HEADER_MAP = {
  '사업코드': 'serial_no',
  '기관명': 'agency_name',
  '사업명': 'project_name',
  '환경영향평가종류': 'assessment_type_label',
  '협의구분': 'consult_type',
  '사업지': 'location',
  '규모(대지면적)': 'site_area',
  '회신일': 'reply_date',
  '평가서 공개유무': 'is_public',
};

function _eiaParsePublic(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (s.includes('비공개')) return false;
  if (s.includes('공개')) return true;
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
    for (const [korHeader, key] of Object.entries(EIA_HEADER_MAP)) {
      mapped[key] = row[korHeader];
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
    };
  });
}

async function _eiaHandleUpload(blockEl) {
  const assessmentType = blockEl.dataset.type;
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

    if (rows.length === 0) {
      const proceed = confirm(
        `"${assessmentType}" 유형에 0건이 업로드됩니다. 기존 데이터가 모두 삭제됩니다. 계속하시겠습니까?`
      );
      if (!proceed) {
        statusEl.innerHTML = '<p class="archive-empty">취소되었습니다.</p>';
        return;
      }
    }

    statusEl.innerHTML = '<p class="archive-empty">업로드 중...</p>';

    const res = await _adminFetch('/eia-list', {
      method: 'POST',
      body: JSON.stringify({ assessment_type: assessmentType, rows }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '업로드 실패');

    statusEl.innerHTML =
      `<p class="status-ok">${data.inserted}건 등록됨` +
      (data.skipped ? ` (사업코드 없음 ${data.skipped}건 스킵)` : '') +
      `</p>`;
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
