"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Machine } from "@/types/machine";
import type {
  ChecklistAnswer,
  ChecklistRecurrenceStatus,
  ChecklistResponse,
  ChecklistTemplate,
} from "@/types/checklist";

type LoadState = "idle" | "loading" | "ready" | "error";
type LookupState = "idle" | "searching" | "found" | "not_found" | "error";

type Params = {
  tag: string;
};

type CachedUser = {
  id: string;
  matricula: string;
  nome: string;
};

type AnswerDraft = {
  questionId: string;
  response?: "ok" | "nc" | "na";
  observation?: string;
};

type AnswerMap = Record<string, AnswerDraft>;
type PhotoMap = Record<string, File | null>;

type PreviousResponseMeta = {
  id: string;
  createdAt?: string | null;
};

type PreviousNcMap = Record<string, ChecklistAnswer>;

type UserLookup = {
  state: LookupState;
  message: string;
};

const initialLookup: UserLookup = {
  state: "idle",
  message: "",
};

export default function ChecklistByTagPage() {
  const { tag } = useParams<Params>();
  const router = useRouter();

  const [state, setState] = useState<LoadState>("idle");
  const [machine, setMachine] = useState<Machine | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const [matricula, setMatricula] = useState("");
  const [nome, setNome] = useState("");
  const [km, setKm] = useState("");
  const [horimetro, setHorimetro] = useState("");

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [photos, setPhotos] = useState<PhotoMap>({});

  const [previousResponseMeta, setPreviousResponseMeta] =
    useState<PreviousResponseMeta | null>(null);
  const [previousNcMap, setPreviousNcMap] = useState<PreviousNcMap>({});
  const [previousLoading, setPreviousLoading] = useState(false);
  const [previousError, setPreviousError] = useState<string | null>(null);
  const [recurrenceDecisions, setRecurrenceDecisions] = useState<
    Record<string, ChecklistRecurrenceStatus | undefined>
  >({});

  const [userLookup, setUserLookup] = useState<UserLookup>(initialLookup);
  const [userInfo, setUserInfo] = useState<CachedUser | null>(null);

  const machinesCol = useMemo(() => collection(db, "machines"), []);
  const templatesCol = useMemo(() => collection(db, "checklistTemplates"), []);
  const usersCol = useMemo(() => collection(db, "users"), []);
  const responsesCol = useMemo(() => collection(db, "checklistResponses"), []);

  useEffect(() => {
    const load = async () => {
      try {
        setState("loading");

        const machineQuery = query(
          machinesCol,
          where("tag", "==", decodeURIComponent(String(tag)))
        );
        const machineSnap = await getDocs(machineQuery);
        if (machineSnap.empty) {
          throw new Error("Maquina nao encontrada pelo QR ou TAG.");
        }
        const machineDoc = machineSnap.docs[0];
        const machineData = {
          id: machineDoc.id,
          ...(machineDoc.data() as Omit<Machine, "id">),
        } as Machine;
        setMachine(machineData);

        if (machineData.checklists?.length) {
          const fetched: ChecklistTemplate[] = [];
          for (const tplId of machineData.checklists) {
            const tplSnap = await getDoc(doc(templatesCol, tplId));
            if (tplSnap.exists()) {
              const tpl = {
                id: tplSnap.id,
                ...(tplSnap.data() as Omit<ChecklistTemplate, "id">),
              } as ChecklistTemplate;
              if (tpl.isActive) {
                fetched.push(tpl);
              }
            }
          }
          setTemplates(fetched);
          if (fetched.length > 0) {
            setSelectedTemplateId(fetched[0].id);
          }
        } else {
          setTemplates([]);
        }

        const savedMatricula = sessionStorage.getItem("matricula");
        const savedNome = sessionStorage.getItem("nome");
        if (savedMatricula) setMatricula(savedMatricula);
        if (savedNome) setNome(savedNome);

        setState("ready");
      } catch (error) {
        console.error(error);
        setState("error");
      }
    };

    load();
  }, [machinesCol, tag, templatesCol]);

  useEffect(() => {
    const trimmed = matricula.trim();

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
  }, [matricula, usersCol]);

  const currentTemplate = useMemo(() => {
    return templates.find((tpl) => tpl.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    let cancelled = false;

    const fetchPrevious = async () => {
      if (!machine || !currentTemplate) {
        if (!cancelled) {
          setPreviousLoading(false);
          setPreviousResponseMeta(null);
          setPreviousNcMap({});
          setPreviousError(null);
        }
        return;
      }

      try {
        setPreviousLoading(true);
        setPreviousError(null);

        const previousQuery = query(
          responsesCol,
          where("machineId", "==", machine.id),
          where("templateId", "==", currentTemplate.id),
          orderBy("createdAt", "desc"),
          limit(1),
        );

        const previousSnap = await getDocs(previousQuery);
        if (cancelled) {
          return;
        }

        if (previousSnap.empty) {
          setPreviousResponseMeta(null);
          setPreviousNcMap({});
          setPreviousLoading(false);
          return;
        }

        const docSnap = previousSnap.docs[0];
        const data = docSnap.data() as Omit<ChecklistResponse, "id">;
        const meta: PreviousResponseMeta = {
          id: docSnap.id,
          createdAt: data.createdAt ?? null,
        };

        const ncMap: PreviousNcMap = {};
        for (const answer of data.answers ?? []) {
          if (answer?.response === "nc") {
            ncMap[answer.questionId] = answer as ChecklistAnswer;
          }
        }

        setPreviousResponseMeta(meta);
        setPreviousNcMap(ncMap);
        setRecurrenceDecisions({});
      } catch (error) {
        console.error("Erro ao carregar checklist anterior", error);
        if (!cancelled) {
          setPreviousResponseMeta(null);
          setPreviousNcMap({});
          setPreviousError("Não foi possível verificar o checklist anterior deste equipamento.");
        }
      } finally {
        if (!cancelled) {
          setPreviousLoading(false);
        }
      }
    };

    void fetchPrevious();

    return () => {
      cancelled = true;
    };
  }, [machine, currentTemplate, responsesCol]);

  useEffect(() => {
    setAnswers({});
    setPhotos({});
    setRecurrenceDecisions({});
    setPreviousNcMap({});
    setPreviousResponseMeta(null);
    setPreviousError(null);
  }, [selectedTemplateId]);

  const setResponse = (questionId: string, value: "ok" | "nc" | "na") => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? { questionId };
      return {
        ...prev,
        [questionId]: {
          ...current,
          questionId,
          response: value,
        },
      };
    });
  };

  const setObservation = (questionId: string, value: string) => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? { questionId };
      return {
        ...prev,
        [questionId]: {
          ...current,
          questionId,
          observation: value,
        },
      };
    });
  };

  const setRecurrenceDecision = (
    questionId: string,
    status: ChecklistRecurrenceStatus,
  ) => {
    setRecurrenceDecisions((prev) => ({
      ...prev,
      [questionId]: status,
    }));
  };

  const onPhotoChange = (questionId: string, file: File | null) => {
    setPhotos((prev) => ({
      ...prev,
      [questionId]: file,
    }));
  };

  const validateUser = async () => {
    const trimmed = matricula.trim();
    if (!trimmed) {
      throw new Error("Informe a matricula.");
    }
    if (!userInfo || userLookup.state !== "found" || userInfo.matricula !== trimmed) {
      throw new Error("Matricula nao cadastrada ou permitida.");
    }
    return {
      userId: userInfo.id,
      nome: userInfo.nome,
    };
  };

  const handleSubmit = async () => {
    if (!machine || !currentTemplate) {
      return;
    }

    try {
      const { userId, nome: nomeResolved } = await validateUser();

      const previousNcIds = Object.keys(previousNcMap);
      if (previousNcIds.length && previousResponseMeta) {
        const unansweredRecurrence = previousNcIds.filter(
          (questionId) => previousNcMap[questionId] && !recurrenceDecisions[questionId],
        );

        if (unansweredRecurrence.length) {
          const missingQuestions = unansweredRecurrence
            .map((questionId) =>
              currentTemplate.questions.find((question) => question.id === questionId)?.text || questionId,
            )
            .join(", ");

          alert(
            `Informe se as não conformidades anteriores foram resolvidas para: ${missingQuestions}.`,
          );
          return;
        }
      }

      const missing = currentTemplate.questions.filter(
        (question) => !answers[question.id]?.response
      );
      if (missing.length) {
        alert(`Responda todas as perguntas (${missing.length} faltando).`);
        return;
      }

      const photoIssues = currentTemplate.questions.filter((question) => {
        const base = answers[question.id];
        return (
          base?.response === "nc" &&
          question.requiresPhoto &&
          !photos[question.id]
        );
      });
      if (photoIssues.length) {
        alert(
          `Foto obrigatoria para perguntas marcadas como NC: ${photoIssues
            .map((question) => question.text)
            .join(", ")}`
        );
        return;
      }

      const uploadedAnswers: ChecklistAnswer[] = [];
      for (const question of currentTemplate.questions) {
        const base = answers[question.id];
        if (!base || !base.response) {
          continue;
        }

        let photoUrl: string | undefined = undefined;
        const file = photos[question.id] || null;

        if (file) {
          const path = `checklists/${machine.id}/${currentTemplate.id}/${Date.now()}-${question.id}-${file.name}`;
          const bucketRef = ref(storage, path);
          await uploadBytes(bucketRef, file);
          photoUrl = await getDownloadURL(bucketRef);
        }

        const answer: ChecklistAnswer = {
          questionId: question.id,
          response: base.response,
        };

        if (photoUrl !== undefined) {
          answer.photoUrl = photoUrl;
        }

        const observationText = base.observation?.trim();
        if (observationText) {
          answer.observation = observationText;
        }

        if (previousResponseMeta && previousNcMap[question.id]) {
          const recurrenceStatus = recurrenceDecisions[question.id];
          if (recurrenceStatus) {
            answer.recurrence = {
              previousResponseId: previousResponseMeta.id,
              status: recurrenceStatus,
              notedAt: new Date().toISOString(),
            };
          }
        }

        uploadedAnswers.push(answer);
      }

      const kmValue = km.trim();
      const horimetroValue = horimetro.trim();
      const matriculaValue = matricula.trim();
      const nomeValue = nomeResolved ? nomeResolved.trim() : "";

      const payload: Record<string, unknown> = {
        machineId: machine.id,
        userId,
        operatorMatricula: matriculaValue,
        operatorNome: nomeValue || null,
        templateId: currentTemplate.id,
        createdAt: new Date().toISOString(),
        createdAtTs: serverTimestamp(),
        answers: uploadedAnswers,
      };

      if (kmValue !== "") {
        const kmNumber = Number(kmValue);
        if (!Number.isNaN(kmNumber)) {
          payload.km = kmNumber;
        }
      }

      if (horimetroValue !== "") {
        const horimetroNumber = Number(horimetroValue);
        if (!Number.isNaN(horimetroNumber)) {
          payload.horimetro = horimetroNumber;
        }
      }

      await addDoc(responsesCol, payload);

      alert("Checklist enviado com sucesso!");
      router.push("/login");
    } catch (error) {
      console.error(error);
      alert((error as Error)?.message || "Erro ao enviar checklist.");
    }
  };

  if (state === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-900 text-white">
        Carregando checklist...
      </div>
    );
  }

  if (state === "error" || !machine) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-900 text-white">
        <div className="bg-gray-800 p-6 rounded-xl">
          <p className="text-red-400 font-semibold">Maquina nao encontrada pelo QR ou TAG.</p>
        </div>
      </div>
    );
  }

  const hasPreviousNc = Object.keys(previousNcMap).length > 0;
  const previousChecklistDate = previousResponseMeta?.createdAt
    ? new Date(previousResponseMeta.createdAt)
    : null;
  const previousChecklistDateLabel =
    previousChecklistDate && !Number.isNaN(previousChecklistDate.getTime())
      ? previousChecklistDate.toLocaleString()
      : null;

  const submitDisabled = !currentTemplate || userLookup.state !== "found";

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">Checklist - {machine.modelo}</h1>
          <p className="text-sm text-gray-400">
            TAG: <code className="bg-gray-800 px-2 py-1 rounded border border-gray-700">{machine.tag}</code>
          </p>
        </header>

        <section className="bg-gray-800 p-4 rounded-xl space-y-3">
          <h2 className="font-semibold">Identificacao</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Matricula</label>
              <input
                value={matricula}
                onChange={(event) => setMatricula(event.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
                placeholder="Ex: 1001"
                inputMode="numeric"
              />
              {userLookup.state === "searching" && (
                <p className="text-xs text-gray-400 mt-1">Buscando matricula...</p>
              )}
              {userLookup.state === "not_found" && (
                <p className="text-xs text-red-400 mt-1">{userLookup.message}</p>
              )}
              {userLookup.state === "error" && (
                <p className="text-xs text-red-400 mt-1">{userLookup.message}</p>
              )}
              {userLookup.state === "found" && nome && (
                <p className="text-xs text-emerald-400 mt-1">Operador encontrado.</p>
              )}
            </div>
            <div>
              <label className="text-sm">Nome do operador</label>
              <input
                value={nome}
                readOnly
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 text-gray-300"
                placeholder="Preenchido automaticamente"
              />
            </div>
          </div>
        </section>

        <section className="bg-gray-800 p-4 rounded-xl space-y-3">
          <h2 className="font-semibold">Dados da operacao</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm">KM (se aplicavel)</label>
              <input
                type="number"
                value={km}
                onChange={(event) => setKm(event.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm">Horimetro (se aplicavel)</label>
              <input
                type="number"
                value={horimetro}
                onChange={(event) => setHorimetro(event.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm">Tipo de checklist</label>
              <select
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2"
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title} (v{template.version})
                  </option>
                ))}
                {templates.length === 0 && <option>Sem templates vinculados</option>}
              </select>
            </div>
          </div>
        </section>

        <section className="bg-gray-800 p-4 rounded-xl space-y-4">
          <h2 className="font-semibold">Perguntas</h2>

          {currentTemplate ? (
            <div className="space-y-4">
              {previousLoading && (
                <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-3 text-sm text-gray-300">
                  Verificando checklist anterior...
                </div>
              )}

              {!previousLoading && previousError && (
                <div className="rounded-lg border border-red-700/60 bg-red-900/30 p-3 text-sm text-red-200">
                  {previousError}
                </div>
              )}

              {!previousLoading && !previousError && hasPreviousNc && (
                <div className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-100">
                  Encontramos não conformidades no checklist anterior
                  {previousChecklistDateLabel ? ` (${previousChecklistDateLabel})` : ""}. Informe se cada item foi
                  resolvido ou permanece em não conformidade.
                </div>
              )}

              {currentTemplate.questions.map((question, index) => {
                const previousNc = previousNcMap[question.id];
                const recurrenceStatus = recurrenceDecisions[question.id];
                const isRecurrence = Boolean(previousNc);

                return (
                  <div
                    key={question.id}
                    className={[
                      "space-y-3 rounded-lg border p-3 transition-colors",
                      isRecurrence ? "border-amber-500/70 bg-amber-500/5" : "border-gray-700 bg-gray-900",
                    ].join(" ")}
                  >
                    <p className="font-medium">
                      {index + 1}. {question.text}
                    </p>

                    {isRecurrence && (
                      <div className="space-y-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100">
                        <p>
                          Este item foi marcado como não conforme no checklist anterior
                          {previousChecklistDateLabel ? ` (${previousChecklistDateLabel})` : ""}. Informe se a não
                          conformidade foi resolvida.
                        </p>
                        {previousNc?.observation && (
                          <p className="text-xs text-amber-200/80">
                            Observação anterior: <span className="text-amber-100">{previousNc.observation}</span>
                          </p>
                        )}
                        {previousNc?.photoUrl && (
                          <a
                            href={previousNc.photoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex text-xs font-medium text-amber-100 underline"
                          >
                            Ver evidência anterior
                          </a>
                        )}
                        <div className="flex flex-wrap gap-4 text-xs sm:text-sm">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name={`recurrence-${question.id}`}
                              value="resolved"
                              checked={recurrenceStatus === "resolved"}
                              onChange={() => setRecurrenceDecision(question.id, "resolved")}
                              className="accent-emerald-500"
                            />
                            <span>Resolvido</span>
                          </label>
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="radio"
                              name={`recurrence-${question.id}`}
                              value="still_nc"
                              checked={recurrenceStatus === "still_nc"}
                              onChange={() => setRecurrenceDecision(question.id, "still_nc")}
                              className="accent-amber-500"
                            />
                            <span>Permanece não conforme</span>
                          </label>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-3 text-sm">
                      {(["ok", "nc", "na"] as const).map((value) => (
                        <label key={value} className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name={`q-${question.id}`}
                            value={value}
                            checked={answers[question.id]?.response === value}
                            onChange={() => setResponse(question.id, value)}
                            className="accent-blue-500"
                          />
                          <span className="uppercase">{value}</span>
                        </label>
                      ))}
                    </div>

                    <div>
                      <label className="block text-sm text-gray-300">Observações</label>
                      <textarea
                        value={answers[question.id]?.observation ?? ""}
                        onChange={(event) => setObservation(question.id, event.target.value)}
                        rows={3}
                        placeholder="Registre detalhes importantes, evidências ou observações adicionais"
                        className={[
                          "mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white",
                          "placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                        ].join(" ")}
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-400">
                        Foto {question.requiresPhoto ? "(obrigatória para NC)" : "(opcional)"}
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(event) => onPhotoChange(question.id, event.target.files?.[0] || null)}
                        className={[
                          "mt-1 block w-full text-xs",
                          "file:mr-3 file:rounded-md file:border-0 file:bg-gray-700 file:px-2 file:py-1 file:text-white",
                          "hover:file:bg-gray-600",
                        ].join(" ")}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Nenhum template selecionado ou vinculado.</p>
          )}
        </section>

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitDisabled}
          >
            Enviar Checklist
          </button>
        </div>
      </div>
    </div>
  );
}
