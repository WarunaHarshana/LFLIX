"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "oled";
type Accent = "default" | "red" | "blue" | "purple" | "green";

interface ThemeContextType {
  theme: Theme;
  accent: Accent;
  setTheme: (theme: Theme) => void;
  setAccent: (accent: Accent) => void;
  isMounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [accent, setAccentState] = useState<Accent>("default");
  const [isMounted, setIsMounted] = useState(false);

  // Sync state with DOM and localStorage
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("lflix-theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const setAccent = (newAccent: Accent) => {
    setAccentState(newAccent);
    localStorage.setItem("lflix-accent", newAccent);
    document.documentElement.setAttribute("data-accent", newAccent);
  };

  useEffect(() => {
    // Read from local storage on mount
    const savedTheme = (localStorage.getItem("lflix-theme") as Theme) || "dark";
    const savedAccent = (localStorage.getItem("lflix-accent") as Accent) || "default";

    setThemeState(savedTheme);
    setAccentState(savedAccent);
    
    // Apply to DOM
    document.documentElement.setAttribute("data-theme", savedTheme);
    document.documentElement.setAttribute("data-accent", savedAccent);
    
    setIsMounted(true);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent, isMounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
