"use client";

import { useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { User } from "@/types/user";

export default function LoginPage() {
  const [matricula, setMatricula] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const q = query(
        collection(db, "users"),
        where("matricula", "==", matricula.trim())
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError("Matricula nao encontrada.");
        setUser(null);
      } else {
        const data = snapshot.docs[0].data() as User;
        setUser({ ...data, id: snapshot.docs[0].id });
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao fazer login.");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="bg-gray-800 p-8 rounded-2xl shadow-lg w-96">
        <h1 className="text-2xl font-bold mb-4 text-center">Login</h1>

        <input
          type="text"
          placeholder="Digite sua matricula"
          value={matricula}
          onChange={(e) => setMatricula(e.target.value)}
          className="w-full px-4 py-2 rounded-md bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold disabled:opacity-50"
        >
          {loading ? "Carregando..." : "Entrar"}
        </button>

        {error && <p className="mt-2 text-red-400">{error}</p>}

        {user && (
          <div className="mt-4 p-3 bg-green-700 rounded-md">
            <p>
              Bem-vindo, <strong>{user.nome}</strong>!
            </p>
            <p>Funcao: {user.role}</p>
          </div>
        )}
      </div>
    </div>
  );
}
