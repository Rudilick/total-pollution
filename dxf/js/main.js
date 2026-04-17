/**
 * main.js
 * 앱 초기화 및 분석 실행
 */

document.addEventListener('DOMContentLoaded', () => {
  initSlots();
});

function runAll() {
  showError('');
  document.getElementById('results').style.display = 'none';

  try {
    const result = runAnalysis(slots);
    renderResults(result);
  } catch (e) {
    showError(e.message || String(e));
  }
}
