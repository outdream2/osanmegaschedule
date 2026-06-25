// src/hooks/useAuth.ts
import { useState, useEffect, useCallback } from "react";
import type { AuthSession } from "../types";

const STORAGE_KEY = "megatown_auth_session";

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    const VALID_ROLES: string[] = ["superadmin", "admin", "manager", "employee"];
    if (parsed && VALID_ROLES.includes(parsed.role)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Auth session hook. Sessions persist in localStorage with NO expiration —
 * they last until an explicit clearSession() call.
 */
export function useAuth() {
  const [session, setSessionState] = useState<AuthSession | null>(() => readSession());

  // Stay in sync if another tab updates the same key
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSessionState(readSession());
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setSession = useCallback((next: AuthSession | null) => {
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    setSessionState(next);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSessionState(null);
  }, []);

  return { session, setSession, clearSession };
}
