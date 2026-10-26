"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import * as React from "react";
import { useLocalStorageValue } from "@/lib/hooks/use-local-storage";
import { Menu, MenuItem } from "@/components/ui/menu";

type Theme = "dark" | "light" | "system";

function apply(theme: Theme) {
  const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  document.documentElement.setAttribute("data-theme", resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved === "light" ? "#F5F7FA" : "#0A0C13");
}

export function ThemeToggle() {
  const [stored, setStored] = useLocalStorageValue("lo-theme", "dark");
  const theme = (["dark", "light", "system"].includes(stored) ? stored : "dark") as Theme;
  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (theme === "system") apply("system");
    };
    apply(theme);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);
  const choose = (t: Theme, close: () => void) => {
    setStored(t);
    apply(t);
    close();
  };
  const Icon = theme === "light" ? Sun : theme === "system" ? Monitor : Moon;
  return (
    <Menu
      label="Alterar tema"
      trigger={
        <span className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg">
          <Icon className="h-4 w-4" aria-hidden />
          <span className="sr-only">{theme === "system" ? "Tema do sistema" : theme === "light" ? "Tema claro" : "Tema escuro"}</span>
        </span>
      }
    >
      {(close) => (
        <>
          <MenuItem onClick={() => choose("dark", close)}>
            <Moon className="h-4 w-4" aria-hidden /> Escuro {theme === "dark" ? "✓" : ""}
          </MenuItem>
          <MenuItem onClick={() => choose("light", close)}>
            <Sun className="h-4 w-4" aria-hidden /> Claro {theme === "light" ? "✓" : ""}
          </MenuItem>
          <MenuItem onClick={() => choose("system", close)}>
            <Monitor className="h-4 w-4" aria-hidden /> Sistema {theme === "system" ? "✓" : ""}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
