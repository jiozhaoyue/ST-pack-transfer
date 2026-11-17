/* docs 站交互：深浅模式 + 中英切换。零依赖，失败不阻塞阅读。 */
(() => {
  const root = document.documentElement;
  const themeKey = 'stpt.docs.theme';
  const themeBtn = document.getElementById('docs-theme');
  const langBtn = document.getElementById('docs-lang');
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const storedTheme = () => {
    try { return localStorage.getItem(themeKey); } catch { return null; }
  };

  const applyTheme = (theme, persist) => {
    const value = theme === 'dark' ? 'dark' : 'light';
    root.dataset.theme = value;
    if (persist) {
      try { localStorage.setItem(themeKey, value); } catch { /* ignore */ }
    }
    if (!themeBtn) return;
    const dark = value === 'dark';
    themeBtn.textContent = dark ? '☀️' : '🌙';
    const label = dark ? themeBtn.dataset.labelLight : themeBtn.dataset.labelDark;
    if (label) {
      themeBtn.setAttribute('aria-label', label);
      themeBtn.setAttribute('title', label);
    }
  };

  applyTheme(storedTheme() || (media.matches ? 'dark' : 'light'), false);

  themeBtn?.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });

  const onSystemTheme = (event) => {
    if (!storedTheme()) applyTheme(event.matches ? 'dark' : 'light', false);
  };
  if (typeof media.addEventListener === 'function') media.addEventListener('change', onSystemTheme);
  else if (typeof media.addListener === 'function') media.addListener(onSystemTheme);

  langBtn?.addEventListener('click', (event) => {
    const alt = langBtn.dataset.altUrl || document.body.dataset.altUrl;
    if (!alt) return;
    event.preventDefault();
    location.href = alt + (location.hash || '');
  });
})();
