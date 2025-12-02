"use client";

export default function ThemeToggle() {
  function toggle() {
    const html = document.documentElement;
    const next = html.classList.contains("dark") ? "light" : "dark";

    html.classList.remove("light", "dark");
    html.classList.add(next);
    localStorage.setItem("theme", next);

    // Let the chart know
    window.dispatchEvent(new Event("theme-change"));
  }

  return (
    <button
      onClick={toggle}
      className="theme-toggle-btn"
      aria-label="Toggle Theme"
    >
      🌓
    </button>
  );
}
