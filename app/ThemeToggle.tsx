"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  /* --------------------------------------------------------
     Load initial theme from localStorage
  -------------------------------------------------------- */
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
      setTheme("dark");
    } else {
      document.documentElement.classList.remove("dark");
      setTheme("light");
    }
  }, []);

  /* --------------------------------------------------------
     Toggle Theme
  -------------------------------------------------------- */
  const toggle = () => {
    const newTheme = theme === "light" ? "dark" : "light";

    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);

    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    // Tell the chart to update its colors
    window.dispatchEvent(new Event("theme-change"));
  };

  return (
    <button
      onClick={toggle}
      className="theme-toggle"
      aria-label="Toggle Theme"
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
