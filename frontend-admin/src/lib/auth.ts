import { useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const TOKEN_KEY = "onekey_rag_admin_access_token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function requireToken(): boolean {
  return !!getToken();
}

/**
 * 认证状态 Hook
 * 提供登录状态检查和登出功能
 */
export function useAuth() {
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthenticated = useMemo(() => requireToken(), []);

  const logout = useCallback(() => {
    clearToken();
    navigate("/login", { replace: true, state: { from: location.pathname } });
  }, [navigate, location.pathname]);

  const loginRedirect = useCallback(() => {
    if (!isAuthenticated) {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }
  }, [isAuthenticated, navigate, location.pathname]);

  return {
    isAuthenticated,
    logout,
    loginRedirect,
    token: getToken(),
  };
}

