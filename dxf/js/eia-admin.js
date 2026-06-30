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

// ── 광역/기초자치단체 표준화 ────────────────────────────────
// 오타/줄임말/옛 행정구역명을 region-standard.js의 표준 명칭으로 맞춘다.
// 자동(정확매칭→줄임말→퀀타이징)으로 못 푸는 (province, city) 조합이 있으면
// 모달을 띄워 사용자가 직접 고르게 하고, 같은 조합의 모든 행에 일괄 적용한다.
// 모달에서 취소하면 null을 반환한다.
async function _resolveRegionNames(rows) {
  const pairKey = r => `${r.province || ''}|${r.city || ''}`;
  const uniquePairs = new Map(); // key -> { province, city }
  rows.forEach(r => {
    if (!r.province && !r.city) return; // 둘 다 없으면 그대로 둠(평가목록에 칸이 없는 옛 자료 등)
    const key = pairKey(r);
    if (!uniquePairs.has(key)) uniquePairs.set(key, { province: r.province, city: r.city });
  });

  const resolved = new Map(); // key -> { province, city } (표준화된 값, null이면 못 풂)
  const unresolved = [];
  uniquePairs.forEach((pair, key) => {
    const province = normalizeProvince(pair.province);
    const city = normalizeCity(pair.city, province);
    if (province && city) {
      resolved.set(key, { province, city });
    } else {
      unresolved.push({ key, raw: pair, province, city });
    }
  });

  if (unresolved.length) {
    const fixes = await _showRegionFixModal(unresolved);
    if (fixes === null) return null; // 사용자가 취소
    fixes.forEach((fix, key) => resolved.set(key, fix));
  }

  return rows.map(r => {
    if (!r.province && !r.city) return r;
    const fixed = resolved.get(pairKey(r));
    if (!fixed) return r; // 건너뛰기 선택된 조합 — 원래 값 그대로 둠
    return { ...r, province: fixed.province, city: fixed.city };
  });
}

/** 수정 모달 — 확인 시 Map(key -> {province, city}), 취소 시 null을 resolve한다. */
function _showRegionFixModal(unresolved) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'region-fix-overlay';

    const box = document.createElement('div');
    box.className = 'region-fix-box';
    box.innerHTML =
      `<div class="section-title">⚠️ 광역/기초자치단체 확인 필요</div>
       <p class="section-hint">아래 ${unresolved.length}개 조합은 표준 행정구역명으로 자동 변환되지 않았습니다.
       올바른 광역/기초자치단체를 선택하거나, 모르면 "건너뛰기"를 누르세요(그 행은 지역 정보 없이 업로드됩니다).</p>
       <div class="region-fix-rows"></div>
       <div class="region-fix-actions">
         <button type="button" class="run-btn btn-sm" id="region-fix-cancel">취소(업로드 안 함)</button>
         <button type="button" class="run-btn btn-sm" id="region-fix-confirm">확인하고 계속</button>
       </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const rowsEl = box.querySelector('.region-fix-rows');
    const rowStates = unresolved.map(u => ({ ...u, skip: false }));

    rowStates.forEach((u, idx) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'region-fix-row';

      const label = document.createElement('div');
      label.className = 'region-fix-raw';
      label.textContent = `"${u.raw.province || '(없음)'}" / "${u.raw.city || '(없음)'}"`;
      rowEl.appendChild(label);

      const provinceSel = document.createElement('select');
      provinceSel.className = 'admin-input';
      provinceSel.innerHTML = '<option value="">광역자치단체 선택</option>' +
        STANDARD_PROVINCES.map(p => `<option value="${p}"${p === u.province ? ' selected' : ''}>${p}</option>`).join('');
      rowEl.appendChild(provinceSel);

      const citySel = document.createElement('select');
      citySel.className = 'admin-input';
      function _fillCityOptions(province) {
        const cities = STANDARD_CITIES_BY_PROVINCE[province] || [];
        citySel.innerHTML = '<option value="">기초자치단체 선택</option>' +
          cities.map(c => `<option value="${c}"${c === u.city ? ' selected' : ''}>${c}</option>`).join('');
        citySel.disabled = !province;
      }
      _fillCityOptions(provinceSel.value);
      provinceSel.onchange = () => _fillCityOptions(provinceSel.value);
      rowEl.appendChild(citySel);

      const skipBtn = document.createElement('button');
      skipBtn.type = 'button';
      skipBtn.className = 'run-btn btn-sm';
      skipBtn.textContent = '건너뛰기';
      skipBtn.onclick = () => {
        rowStates[idx].skip = !rowStates[idx].skip;
        rowEl.classList.toggle('region-fix-row-skipped', rowStates[idx].skip);
        provinceSel.disabled = rowStates[idx].skip;
        citySel.disabled = rowStates[idx].skip || !provinceSel.value;
      };
      rowEl.appendChild(skipBtn);

      rowEl._getValue = () => ({
        skip: rowStates[idx].skip,
        province: provinceSel.value,
        city: citySel.value,
      });
      rowsEl.appendChild(rowEl);
      rowEl._provinceSel = provinceSel;
      rowEl._citySel = citySel;
    });

    function _cleanup() { overlay.remove(); }

    box.querySelector('#region-fix-cancel').onclick = () => { _cleanup(); resolve(null); };
    box.querySelector('#region-fix-confirm').onclick = () => {
      const fixes = new Map();
      const rowEls = [...rowsEl.children];
      let allOk = true;
      rowEls.forEach((rowEl, idx) => {
        const v = rowEl._getValue();
        if (v.skip) return;
        if (!v.province || !v.city) { allOk = false; rowEl.classList.add('region-fix-row-error'); return; }
        fixes.set(unresolved[idx].key, { province: v.province, city: v.city });
      });
      if (!allOk) return; // 미선택 항목이 있으면 막고 빨간 테두리로 표시
      _cleanup();
      resolve(fixes);
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
    let rows = parseEiaWorkbook(buf);

    rows = await _resolveRegionNames(rows);
    if (!rows) { statusEl.innerHTML = ''; return; } // 모달에서 취소함

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

document.addEventListener('DOMContentLoaded', async () => {
  if (!(await _ensureAdminAuth())) return;
  document.querySelectorAll('.eia-upload-block').forEach(blockEl => {
    const btn = blockEl.querySelector('.eia-upload-btn');
    btn.addEventListener('click', () => _eiaHandleUpload(blockEl));
  });
});
