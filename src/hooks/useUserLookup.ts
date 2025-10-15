import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { UserRole } from "@/types/user";

type LookupState = "idle" | "searching" | "found" | "not_found" | "error";

type CachedUser = {
  id: string;
  matricula: string;
  nome: string;
  role: UserRole;
};

type UserLookup = {
  state: LookupState;
  message: string;
};

const initialLookup: UserLookup = {
  state: "idle",
  message: "",
};

export function useUserLookup(matriculaInput: string) {
  const [userLookup, setUserLookup] = useState<UserLookup>(initialLookup);
  const [userInfo, setUserInfo] = useState<CachedUser | null>(null);
  const [nome, setNome] = useState("");

  const usersCol = useMemo(() => collection(db, "users"), []);

  const resetSession = () => {
    sessionStorage.removeItem("matricula");
    sessionStorage.removeItem("nome");
    sessionStorage.removeItem("role");
  };

  useEffect(() => {
    const trimmed = matriculaInput.trim();

    if (!trimmed) {
      setUserLookup(initialLookup);
      setUserInfo(null);
      setNome("");
      resetSession();
      return;
    }

    setUserLookup({ state: "searching", message: "" });

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      try {
        const userQuery = query(usersCol, where("matricula", "==", trimmed));
        const userSnap = await getDocs(userQuery);
        if (cancelled) return;

        if (userSnap.empty) {
          setUserLookup({ state: "not_found", message: "Matricula nao cadastrada." });
          setUserInfo(null);
          setNome("");
          resetSession();
          return;
        }

        const docSnap = userSnap.docs[0];
        const data = docSnap.data() as { nome?: string; role?: UserRole };
        const resolvedNome = data.nome?.trim() ?? "";
        const resolvedRole = data.role;

        const validRoles: readonly UserRole[] = ["operador", "mecanico", "admin"] as const;
        if (!resolvedRole || !validRoles.includes(resolvedRole)) {
          setUserLookup({
            state: "error",
            message: "Usuário sem função válida cadastrada.",
          });
          setUserInfo(null);
          setNome("");
          resetSession();
          return;
        }

        const cached: CachedUser = {
          id: docSnap.id,
          matricula: trimmed,
          nome: resolvedNome,
          role: resolvedRole,
        };

        setUserInfo(cached);
        setNome(resolvedNome);
        setUserLookup({ state: "found", message: "" });
        sessionStorage.setItem("matricula", trimmed);
        if (resolvedNome) {
          sessionStorage.setItem("nome", resolvedNome);
        } else {
          sessionStorage.removeItem("nome");
        }
        sessionStorage.setItem("role", resolvedRole);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setUserLookup({ state: "error", message: "Erro ao buscar a matricula." });
        setUserInfo(null);
        setNome("");
        resetSession();
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [matriculaInput, usersCol]);

  return { userLookup, userInfo, nome, setNome };
}

