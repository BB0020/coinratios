"use client";

import { useEffect } from "react";

export default function ThemeInit() {
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "light";
    document.documentElement.classList.add(saved);
  }, []);

  return null;
}
