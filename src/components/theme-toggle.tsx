"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import styles from "./theme-toggle.module.css";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={styles.toggleBtnPlaceholder} />;
  }

  const currentTheme = theme === 'system' ? resolvedTheme : theme;

  return (
    <button
      className={styles.toggleBtn}
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
      title="Alternar tema"
    >
      {currentTheme === 'dark' ? <Sun size={24} /> : <Moon size={24} />}
    </button>
  );
}
