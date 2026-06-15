import { useEffect, useState } from "react";

const KEY = "remedy-theme";

export function useTheme() {
  // localStorage is the single source of truth; default to light.
  const [theme, setTheme] = useState(() =>
    localStorage.getItem(KEY) === "dark" ? "dark" : "light"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}
