import type { Metadata } from "next";
import AdminLoginClient from "./AdminLoginClient";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = {
  title: "Entrar no painel administrativo - Gestão de Frota",
  description: "Autentique-se para acessar o painel administrativo da Gestão de Frota.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const redirectParam = resolvedSearchParams?.redirect;
  const redirectTo = Array.isArray(redirectParam) ? redirectParam[0] : redirectParam;

  return <AdminLoginClient redirectTo={redirectTo} />;
}
