"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Wait for hydration
  useEffect(() => {
    setMounted(true);
    const html = document.documentElement;
    setTheme(html.classList.contains("dark") ? "dark" : "light");
  }, []);

  // Toggle handler
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);

    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(next);
  }

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      className="theme-toggle-btn"
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <span className="theme-icon">🌙</span>
      ) : (
        <span className="theme-icon">☀️</span>
      )}
    </button>
  );
}
