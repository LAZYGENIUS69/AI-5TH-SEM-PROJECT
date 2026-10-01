import { Link, useLocation } from "@tanstack/react-router";
import {
  Bug,
  Droplets,
  FlaskConical,
  LayoutDashboard,
  Leaf,
  MessagesSquare,
  Moon,
  SquareFunction,
  Sun,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scanner", label: "Crop Scanner", icon: Bug },
  { to: "/chat", label: "Agronomist", icon: MessagesSquare },
  { to: "/irrigation", label: "Irrigation", icon: Droplets },
  { to: "/fertilizer", label: "Fertilizer", icon: FlaskConical },
  { to: "/algorithms", label: "Algorithms", icon: SquareFunction },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const isIrrigation = useLocation({ select: (location) => location.pathname === "/irrigation" });
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("agrisense.theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      return;
    }
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      window.localStorage.setItem("agrisense.theme", nextTheme);
      return nextTheme;
    });
  };

  const isDark = theme === "dark";

  return (
    <div className={`min-h-screen bg-background text-foreground ${isDark ? "dark" : ""} ${isIrrigation ? "agridss-dark" : ""}`}>
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Leaf className="size-5" />
            </span>
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="font-display text-lg font-semibold tracking-tight">AgriSense</span>
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
                Agentic advisor
              </span>
            </span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground data-[status=active]:bg-primary/10 data-[status=active]:text-primary"
              >
                <Icon className="size-4" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            ))}
          </nav>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
                  className="shrink-0"
                >
                  {isDark ? <Sun /> : <Moon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Switch to {isDark ? "light" : "dark"} mode
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-7xl px-4 pb-10 pt-4 text-xs text-muted-foreground">
        Advisory guidance based on ICAR-style extension practice. Always confirm chemical doses with
        your local agriculture officer before field application.
      </footer>
    </div>
  );
}
