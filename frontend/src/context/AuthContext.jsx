import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setToken, clearToken, getToken } from "../lib/api.js";
import { setCurrency } from "../lib/money.js";
import { applyThemeConfig, legacyConfig } from "../lib/branding.js";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySettings = (s) => {
    if (s) {
      setSettings(s);
      setCurrency(s.currency_symbol, s.currency_code);
      applyThemeConfig(legacyConfig(s));
    }
  };

  const loadSettings = useCallback(async () => {
    try {
      const s = await api("/api/settings");
      applySettings(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  const loadSession = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const [me, mods, s] = await Promise.all([api("/api/me"), api("/api/modules"), api("/api/settings")]);
      setUser(me.user || me);
      setModules(mods);
      applySettings(s);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = async (email, password) => {
    const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
    setToken(data.token);
    setUser(data.user);
    const [mods, s] = await Promise.all([api("/api/modules"), api("/api/settings")]);
    setModules(mods);
    applySettings(s);
    return data.user;
  };

  const logout = () => {
    clearToken();
    setUser(null);
    setModules([]);
  };

  const moduleEnabled = (key) => {
    const m = modules.find((x) => x.module_key === key);
    return m ? m.is_enabled : false;
  };

  const hasRole = (...roles) => roles.includes(user?.role);
  // Granular action check — owners can do everything.
  const can = (key) => user?.role === "owner" || (user?.permissions || []).includes(key);

  return (
    <AuthCtx.Provider value={{
      user, modules, settings, loading, login, logout,
      moduleEnabled, hasRole, can, reload: loadSession,
      reloadSettings: loadSettings, applySettings,
    }}>
      {children}
    </AuthCtx.Provider>
  );
}
