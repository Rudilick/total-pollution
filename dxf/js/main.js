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

  try {
    lastResult = runAnalysis(slots);
    renderResults(lastResult);
  } catch (e) {
    showError(e.message || String(e));
  }
}
