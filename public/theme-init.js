/**
 * Theme initialization script - prevents flash of unstyled content (FOUC)
 * This script runs before React hydrates to apply the correct theme class.
 * Default is dark mode.
 */
(function() {
  try {
    var stored = localStorage.getItem('pictures-preferences');
    if (stored) {
      var parsed = JSON.parse(stored);
      var theme = parsed.state && parsed.state.theme;
      // Only show light mode if explicitly set to light
      if (theme === 'light') {
        return; // Don't add dark class
      }
      // For 'system', check system preference
      if (theme === 'system' && !window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return; // System prefers light, don't add dark class
      }
    }
    // Default to dark mode
    document.documentElement.classList.add('dark');
  } catch (e) {
    // Default to dark on error
    document.documentElement.classList.add('dark');
  }
})();
