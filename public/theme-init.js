/**
 * Theme initialization script - prevents flash of unstyled content (FOUC)
 * This script runs before React hydrates to apply the correct theme class.
 */
(function() {
  try {
    var stored = localStorage.getItem('pictures-preferences');
    if (stored) {
      var parsed = JSON.parse(stored);
      var theme = parsed.state && parsed.state.theme;
      if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      // No stored preference, default to system preference
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    // Silently fail if localStorage is unavailable
  }
})();
