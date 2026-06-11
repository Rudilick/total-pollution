/**
 * archive.js
 * 도면 아카이브 검색 및 슬롯 자동 채움
 */

let _archiveOpen = false;

function toggleArchiveSection() {
  _archiveOpen = !_archiveOpen;
  const body = document.getElementById('archive-body');
  const chev = document.getElementById('archive-chevron');
  if (!body || !chev) return;
  body.style.display = _archiveOpen ? 'block' : 'none';
  chev.classList.toggle('open', _archiveOpen);
}

async function onArchiveSearch() {
  const input = document.getElementById('archive-query');
  const resultsEl = document.getElementById('archive-results');
  if (!input || !resultsEl) return;

  const q = input.value.trim();
  resultsEl.innerHTML = '<p class="archive-empty">검색 중...</p>';

  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/projects?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('서버 응답 오류');
    const { projects } = await res.json();
    renderArchiveResults(projects);
  } catch (e) {
    resultsEl.innerHTML = `<p class="archive-empty">검색 실패: ${e.message}</p>`;
  }
}

function renderArchiveResults(projects) {
  const resultsEl = document.getElementById('archive-results');
  if (!resultsEl) return;
  resultsEl.innerHTML = '';

  if (!projects.length) {
    resultsEl.innerHTML = '<p class="archive-empty">검색 결과가 없습니다.</p>';
    return;
  }

  projects.forEach(p => {
    const card = document.createElement('div');
    card.className = 'archive-card';

    const metaParts = [];
    if (p.operator_name)  metaParts.push(p.operator_name);
    if (p.location)       metaParts.push(p.location);
    if (p.first_eia_year) metaParts.push(`${p.first_eia_year}년`);

    card.innerHTML =
      `<div class="archive-card-main">
         <div class="archive-card-title">${p.serial_no} <span class="archive-card-name">${p.project_name}</span></div>
         <div class="archive-card-meta">${metaParts.join(' · ') || '&nbsp;'}</div>
       </div>
       <div class="pill pill-nc">${p.stage_count}단계</div>`;

    card.onclick = () => loadArchiveProject(p.serial_no);
    resultsEl.appendChild(card);
  });
}

function _archiveStageLabel(index) {
  return index === 0 ? '최초 도면' : `${index}차변경`;
}

async function loadArchiveProject(serialNo) {
  const resultsEl = document.getElementById('archive-results');
  if (resultsEl) resultsEl.innerHTML = '<p class="archive-empty">불러오는 중...</p>';

  try {
    const res = await fetch(`${ARCHIVE_API_BASE}/projects/${encodeURIComponent(serialNo)}`);
    if (!res.ok) throw new Error('존재하지 않는 일련번호입니다.');
    const { project, drawings } = await res.json();

    if (!drawings.length) throw new Error('등록된 도면이 없습니다.');

    const newSlots = drawings.map(d => {
      const slot = _newSlot(d.stage_label);
      slot.data = parseDXF(d.dxf_content);
      slot.file = { name: d.file_name };
      return slot;
    });
    newSlots.push(_newSlot(_archiveStageLabel(drawings.length)));

    slots = newSlots;
    renderSlotsWrap();
    updateRunBtn();

    if (resultsEl) {
      resultsEl.innerHTML =
        `<p class="archive-empty">"${project.project_name}" (${project.serial_no}) 도면 ${drawings.length}건을 불러왔습니다.</p>`;
    }
  } catch (e) {
    if (resultsEl) {
      resultsEl.innerHTML = `<p class="archive-empty">불러오기 실패: ${e.message}</p>`;
    }
  }
}
