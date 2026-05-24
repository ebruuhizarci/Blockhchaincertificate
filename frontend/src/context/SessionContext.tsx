import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getStoredUser,
  loginUser,
  logoutUser,
  registerUser,
  type User,
} from "@/lib/auth";
import {
  getStoredInstitution,
  loginInstitution,
  logoutInstitution,
  type Institution,
} from "@/lib/institutionAuth";

export type SessionMode = "user" | "institution" | null;

type SessionContextValue = {
  mode: SessionMode;
  user: User | null;
  institution: Institution | null;
  loginUser: (email: string, password: string) => Promise<void>;
  registerUser: (email: string, password: string, fullName: string) => Promise<void>;
  logoutUser: () => void;
  loginInstitution: (code: string, password: string) => Promise<void>;
  logoutInstitution: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function loadInitialSession(): { user: User | null; institution: Institution | null } {
  const user = getStoredUser();
  const institution = getStoredInstitution();
  // Eski oturumlarda ikisi birden kalmış olabilir — kullanıcı oturumunu koru
  if (user && institution) {
    logoutInstitution();
    return { user, institution: null };
  }
  return { user, institution };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const initial = loadInitialSession();
  const [user, setUser] = useState<User | null>(initial.user);
  const [institution, setInstitution] = useState<Institution | null>(
    initial.institution
  );

  const mode: SessionMode = user
    ? "user"
    : institution
      ? "institution"
      : null;

  const loginUserHandler = useCallback(async (email: string, password: string) => {
    logoutInstitution();
    setInstitution(null);
    const u = await loginUser(email, password);
    setUser(u);
  }, []);

  const registerUserHandler = useCallback(
    async (email: string, password: string, fullName: string) => {
      logoutInstitution();
      setInstitution(null);
      const u = await registerUser(email, password, fullName);
      setUser(u);
    },
    []
  );

  const logoutUserHandler = useCallback(() => {
    logoutUser();
    setUser(null);
  }, []);

  const loginInstitutionHandler = useCallback(
    async (code: string, password: string) => {
      logoutUser();
      setUser(null);
      const inst = await loginInstitution(code, password);
      setInstitution(inst);
    },
    []
  );

  const logoutInstitutionHandler = useCallback(() => {
    logoutInstitution();
    setInstitution(null);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      user,
      institution,
      loginUser: loginUserHandler,
      registerUser: registerUserHandler,
      logoutUser: logoutUserHandler,
      loginInstitution: loginInstitutionHandler,
      logoutInstitution: logoutInstitutionHandler,
    }),
    [
      mode,
      user,
      institution,
      loginUserHandler,
      registerUserHandler,
      logoutUserHandler,
      loginInstitutionHandler,
      logoutInstitutionHandler,
    ]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession SessionProvider içinde kullanılmalı");
  return ctx;
}

/** @deprecated SessionProvider üzerinden useSession kullanın */
export function useAuth() {
  const s = useSession();
  return {
    user: s.user,
    login: s.loginUser,
    register: s.registerUser,
    logout: s.logoutUser,
  };
}

/** @deprecated SessionProvider üzerinden useSession kullanın */
export function useInstitution() {
  const s = useSession();
  return {
    institution: s.institution,
    login: s.loginInstitution,
    logout: s.logoutInstitution,
  };
}

export { useSession };
