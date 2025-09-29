import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type LookupState = "idle" | "searching" | "found" | "not_found" | "error";

type CachedUser = {
  id: string;
  matricula: string;
  nome: string;
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

  useEffect(() => {
    const trimmed = matriculaInput.trim();

    if (!trimmed) {
      setUserLookup(initialLookup);
      setUserInfo(null);
      setNome("");
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
          sessionStorage.removeItem("matricula");
          sessionStorage.removeItem("nome");
          return;
        }

        const docSnap = userSnap.docs[0];
        const data = docSnap.data() as { nome?: string };
        const resolvedNome = data.nome?.trim() ?? "";

        const cached: CachedUser = {
          id: docSnap.id,
          matricula: trimmed,
          nome: resolvedNome,
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
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setUserLookup({ state: "error", message: "Erro ao buscar a matricula." });
        setUserInfo(null);
        setNome("");
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [matriculaInput, usersCol]);

  return { userLookup, userInfo, nome, setNome };
}

