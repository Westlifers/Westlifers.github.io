(() => {
  let preference = 'light';
  try { preference = localStorage.getItem('afterlight-appearance') || 'light'; } catch (_) {}
  // Migrate the old automatic preference to the new default.
  if (!['light', 'dark'].includes(preference)) preference = 'light';
  const apply = () => {
    document.documentElement.dataset.appearance = preference;
    document.documentElement.dataset.theme = preference;
  };
  window.afterlightAppearance = {
    get: () => preference,
    set(value) { if (!['light', 'dark'].includes(value)) return; preference = value; try { localStorage.setItem('afterlight-appearance', value); } catch (_) {} apply(); }
  };
  apply();
})();
