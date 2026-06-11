"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import styles from "./theme-toggle.module.css";

const HIDDEN_PATHS = ['/tv'];

export function ThemeToggle() {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className={styles.toggleBtnPlaceholder} />;
  }

  if (HIDDEN_PATHS.includes(pathname)) {
    return null;
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
