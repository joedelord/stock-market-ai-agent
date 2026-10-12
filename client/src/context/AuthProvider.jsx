import { useCallback, useEffect, useMemo, useState } from "react";

import api from "../services/api";
import AuthContext from "./AuthContext";

// A 401 from these means wrong credentials or not logged in yet, not that a
// session has ended.
const IGNORED_401_URLS = ["/auth/login", "/auth/me"];

async function fetchCurrentUser() {
  try {
    const response = await api.get("/auth/me");

    return response.data.user;
  } catch (error) {
    if (error.response?.status !== 401) {
      console.error("Authentication check failed:", error);
    }

    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const reloadUser = useCallback(async () => {
    setUser(await fetchCurrentUser());
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchCurrentUser().then((currentUser) => {
      if (!cancelled) {
        setUser(currentUser);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // The server can end a session at any time (expiry, logout or password
  // change on another device, account deletion) and change roles. A 401
  // logs the user out here so route guards send them to the login page; a
  // 403 reloads the user so a changed role takes effect.
  useEffect(() => {
    const interceptor = api.interceptors.response.use(undefined, (error) => {
      const status = error.response?.status;

      if (status === 401 && !IGNORED_401_URLS.includes(error.config?.url)) {
        setUser(null);
      } else if (status === 403) {
        reloadUser();
      }

      return Promise.reject(error);
    });

    return () => {
      api.interceptors.response.eject(interceptor);
    };
  }, [reloadUser]);

  const login = useCallback(async (email, password) => {
    const response = await api.post("/auth/login", {
      email,
      password,
    });

    setUser(response.data.user);

    return response.data.user;
  }, []);

  const register = useCallback(async ({ username, email, password }) => {
    const response = await api.post("/auth/register", {
      username,
      email,
      password,
    });

    setUser(response.data.user);

    return response.data.user;
  }, []);

  // Logs out locally even when the request fails, so the user is never
  // stuck on a page they tried to leave.
  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      reloadUser,
    }),
    [user, isLoading, login, register, logout, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
