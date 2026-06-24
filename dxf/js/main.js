/**
 * main.js
 * 앱 초기화 및 분석 실행
 */

let lastResult = null;  // 내보내기에서 참조

document.addEventListener('DOMContentLoaded', () => {
  initSlots();
});

function runAll() {
  showError('');
  document.getElementById('results').style.display = 'none';
  lastResult = null;

  if (typeof polygonClipping === 'undefined') {
    showError('필요한 라이브러리를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
    return;
  }

  try {
    lastResult = runAnalysis(slots);
    renderResults(lastResult);
  } catch (e) {
    showError(e.message || String(e));
  }
}
