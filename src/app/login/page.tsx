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
    if (!matricula.trim()) {
      setError("Por favor, digite sua matrícula.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const q = query(
        collection(db, "users"),
        where("matricula", "==", matricula.trim())
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError("Matrícula não encontrada. Verifique os dados e tente novamente.");
        setUser(null);
      } else {
        const data = snapshot.docs[0].data() as User;
        setUser({ ...data, id: snapshot.docs[0].id });
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao conectar com o servidor. Tente novamente.");
    }

    setLoading(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {/* Background decorativo */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-light/20 to-info-light/20"></div>
      
      <div className="relative w-full max-w-md">
        {/* Card de login */}
        <div className="bg-surface border border-border rounded-large shadow-large p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-large mb-4 shadow-medium">
              <span className="text-2xl font-bold text-white">GF</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Acesso ao Sistema
            </h1>
            <p className="text-foreground-secondary text-sm">
              Digite sua matrícula para acessar o sistema de gestão de frota
            </p>
          </div>

          {/* Formulário */}
          <div className="space-y-6">
            <div>
              <label 
                htmlFor="matricula" 
                className="block text-sm font-medium text-foreground-secondary mb-2"
              >
                Matrícula
              </label>
              <input
                id="matricula"
                type="text"
                placeholder="Digite sua matrícula"
                value={matricula}
                onChange={(e) => setMatricula(e.target.value)}
                onKeyPress={handleKeyPress}
                className="w-full px-4 py-3 rounded-medium bg-surface border border-border text-foreground placeholder-foreground-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all duration-fast"
                disabled={loading}
              />
            </div>

            <button
              onClick={handleLogin}
              disabled={loading || !matricula.trim()}
              className="w-full py-3 bg-primary hover:bg-primary-hover text-white rounded-medium font-semibold transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 shadow-small hover:shadow-medium"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Verificando...</span>
                </div>
              ) : (
                "Entrar no Sistema"
              )}
            </button>
          </div>

          {/* Mensagens de erro */}
          {error && (
            <div className="mt-6 p-4 bg-error-light border border-error/30 rounded-medium">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-error flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-error font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Mensagem de sucesso */}
          {user && (
            <div className="mt-6 p-4 bg-success-light border border-success/30 rounded-medium">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-success flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-success mb-1">
                    Login realizado com sucesso!
                  </p>
                  <p className="text-sm text-foreground-secondary">
                    Bem-vindo(a), <strong className="text-foreground">{user.nome}</strong>
                  </p>
                  <p className="text-xs text-foreground-tertiary mt-1">
                    Função: {user.role}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className="text-xs text-foreground-tertiary">
            Sistema de Gestão de Frota © 2024
          </p>
        </div>
      </div>
    </div>
  );
}
