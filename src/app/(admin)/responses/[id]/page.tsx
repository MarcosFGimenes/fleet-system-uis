"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Machine } from "@/types/machine";
import {
  ChecklistResponse,
  ChecklistTemplate,
} from "@/types/checklist";

type Params = {
  id: string;
};

export default function ResponseDetailPage() {
  const { id } = useParams<Params>();
  const router = useRouter();
  const [response, setResponse] = useState<ChecklistResponse | null>(null);
  const [machine, setMachine] = useState<Machine | null>(null);
  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const responseSnap = await getDoc(doc(db, "checklistResponses", String(id)));
        if (!responseSnap.exists()) {
          throw new Error("Checklist não encontrado.");
        }
        const responseRaw = responseSnap.data() as Omit<ChecklistResponse, "id">;
        const responseData: ChecklistResponse = { id: responseSnap.id, ...responseRaw };
        setResponse(responseData);

        const [machineSnap, templateSnap] = await Promise.all([
          getDoc(doc(db, "machines", responseData.machineId)),
          getDoc(doc(db, "checklistTemplates", responseData.templateId)),
        ]);

        if (machineSnap.exists()) {
          setMachine({ id: machineSnap.id, ...(machineSnap.data() as Omit<Machine, "id">) });
        }

        if (templateSnap.exists()) {
          setTemplate({
            id: templateSnap.id,
            ...(templateSnap.data() as Omit<ChecklistTemplate, "id">),
          });
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="grid place-items-center min-h-[200px] text-gray-300">
        Carregando...
      </div>
    );
  }

  if (!response) {
    return (
      <div className="grid place-items-center min-h-[200px] text-gray-300">
        Checklist não encontrado.
      </div>
    );
  }

  const questionText = (questionId: string) =>
    template?.questions.find((question) => question.id === questionId)?.text ?? questionId;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Detalhes do Checklist</h1>
        <p className="text-sm text-gray-400">
          Enviado em {new Date(response.createdAt).toLocaleString()}
        </p>
      </header>

      <section className="bg-gray-800 p-4 rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-gray-400">Máquina</p>
            <p className="font-medium">{machine?.modelo ?? response.machineId}</p>
            <p className="text-xs text-gray-400">TAG: {machine?.tag ?? "-"}</p>
          </div>
          <div>
            <p className="text-gray-400">Template</p>
            <p className="font-medium">{template?.title ?? response.templateId}</p>
            <p className="text-xs text-gray-400">
              {template ? `${template.type} v${template.version}` : ""}
            </p>
          </div>
          <div>
            <p className="text-gray-400">KM / Hor</p>
            <p className="font-medium">
              {response.km != null ? `KM ${response.km}` : "-"}
              {response.km != null && response.horimetro != null ? " · " : " "}
              {response.horimetro != null ? `Hor ${response.horimetro}` : "-"}
            </p>
          </div>
        </div>
      </section>

      <section className="bg-gray-800 p-4 rounded-xl space-y-3">
        <h2 className="font-semibold">Respostas</h2>
        <div className="space-y-3">
          {response.answers.map((answer, index) => (
            <div
              key={answer.questionId}
              className="p-3 bg-gray-900 rounded-lg border border-gray-700"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {index + 1}. {questionText(answer.questionId)}
                  </p>
                  <p
                    className={`mt-1 text-xs inline-block px-2 py-1 rounded ${
                      answer.response === "nc"
                        ? "bg-red-700"
                        : answer.response === "ok"
                        ? "bg-emerald-700"
                        : "bg-gray-700"
                    }`}
                  >
                    {answer.response.toUpperCase()}
                  </p>
                </div>
                {answer.photoUrl && (
                  <a
                    href={answer.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline text-blue-300"
                  >
                    Abrir foto
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={() => router.back()}
          className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}


