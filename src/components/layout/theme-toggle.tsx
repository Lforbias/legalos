"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useLocalStorageValue } from "@/lib/hooks/use-local-storage";
import { Menu, MenuItem } from "@/components/ui/menu";

type Theme = "dark" | "light" | "system";

function apply(theme: Theme) {
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function ThemeToggle() {
  const [stored, setStored] = useLocalStorageValue("lo-theme", "dark");
  const theme = (["dark", "light", "system"].includes(stored) ? stored : "dark") as Theme;
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
        <span className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg">
          <Icon className="h-4 w-4" aria-hidden />
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
