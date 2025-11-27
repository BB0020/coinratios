"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Load stored theme
  useEffect(() => {
    const stored = localStorage.getItem("theme") as "light" | "dark" | null;
    const initial = stored || "light";

    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
    document.body.classList.toggle("dark", initial === "dark");
  }, []);

  function toggleTheme() {
    const next: "light" | "dark" = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);

    document.documentElement.classList.toggle("dark", next === "dark");
    document.body.classList.toggle("dark", next === "dark");
  }

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle-button"
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Moon size={22} strokeWidth={1.8} />
      ) : (
        <Sun size={22} strokeWidth={1.8} />
      )}
    </button>
  );
}
