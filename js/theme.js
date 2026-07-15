const THEME_KEY = 'gt-theme';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(preference) {
  return preference === 'auto' ? getSystemTheme() : preference;
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-theme-pref', preference);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = resolved === 'dark' ? '#0f1114' : '#f4f2ed';
  }

  document.querySelectorAll('.theme-switcher button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === preference);
    btn.setAttribute('aria-pressed', String(btn.dataset.theme === preference));
  });
}

function setTheme(preference) {
  localStorage.setItem(THEME_KEY, preference);
  applyTheme(preference);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'auto';
  applyTheme(saved);

  document.querySelectorAll('.theme-switcher button').forEach(btn => {
    btn.addEventListener('click', () => setTheme(btn.dataset.theme));
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const pref = localStorage.getItem(THEME_KEY) || 'auto';
    if (pref === 'auto') applyTheme('auto');
  });
}

initTheme();
