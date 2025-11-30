"use client";

export default function ThemeToggle() {

  function toggleTheme() {
    const html = document.documentElement;
    const next = html.classList.contains("dark") ? "light" : "dark";

    // Remove both, add new one
    html.classList.remove("light", "dark");
    html.classList.add(next);

    localStorage.setItem("theme", next);

    // Notify listeners (chart, etc.)
    window.dispatchEvent(new Event("theme-change"));
  }

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-btn"
      aria-label="Toggle Theme"
    >
      🌓
    </button>
  );
}
