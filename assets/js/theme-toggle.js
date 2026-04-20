// 테마 토글: localStorage 영속화 + 버튼 클릭 핸들러
// 초기 적용은 각 HTML의 head 인라인 스크립트에서 수행 (FOUC 방지)

(function () {
  const THEME_KEY = 'theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  function applyTheme(theme) {
    if (theme === LIGHT) {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', DARK);
    }
    localStorage.setItem(THEME_KEY, theme);
  }

  document.addEventListener('DOMContentLoaded', function () {
    const button = document.querySelector('.theme-toggle');
    if (!button) return;

    button.addEventListener('click', function () {
      const current = localStorage.getItem(THEME_KEY) || DARK;
      applyTheme(current === DARK ? LIGHT : DARK);
    });
  });
})();
