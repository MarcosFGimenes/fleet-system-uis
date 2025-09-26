"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Machine } from "@/types/machine";
import { ChecklistAnswer, ChecklistTemplate } from "@/types/checklist";

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

export default function ChecklistByTagPage() {
  const { tag } = useParams<Params>();
  const router = useRouter();

  const [state, setState] = useState<LoadState>("idle");
  const [machine, setMachine] = useState<Machine | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [matricula, setMatricula] = useState("");
  const [nome, setNome] = useState("");
  const [km, setKm] = useState<string>("");
  const [horimetro, setHorimetro] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>({});
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [userLookupState, setUserLookupState] = useState<LookupState>("idle");
  const [userLookupMessage, setUserLookupMessage] = useState<string>("");
  const [userInfo, setUserInfo] = useState<CachedUser | null>(null);

  const machinesCol = useMemo(() => collection(db, "machines"), []);
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
          throw new Error("Machine not found for the provided QR tag.");
        }
        const machineDoc = machineSnap.docs[0];
        const machineData = {
          id: machineDoc.id,
          ...(machineDoc.data() as Omit<Machine, "id">),
        } as Machine;
        setMachine(machineData);

        if (machineData.checklists?.length) {
          const fetched: ChecklistTemplate[] = [];
          for (const templateId of machineData.checklists) {
            const templateDoc = await getDoc(doc(db, "checklistTemplates", templateId));
            if (templateDoc.exists()) {
              fetched.push({
                id: templateDoc.id,
                ...(templateDoc.data() as Omit<ChecklistTemplate, "id">),
              });
            }
          }
          const activeTemplates = fetched.filter((template) => template.isActive);
          setTemplates(activeTemplates);
          if (activeTemplates.length) {
            setSelectedTemplateId(activeTemplates[0].id);
          }
        } else {
          setTemplates([]);
        }

        const savedMatricula = sessionStorage.getItem("matricula");
        const savedNome = sessionStorage.getItem("nome");
        if (savedMatricula) {
          setMatricula(savedMatricula);
        }
        if (savedNome) {
          setNome(savedNome);
        }

        setState("ready");
      } catch (error) {
        console.error(error);
        setState("error");
      }
    };

    load();
  }, [machinesCol, tag]);

  useEffect(() => {
    const trimmed = matricula.trim();

    if (!trimmed) {
      setUserLookupState("idle");
      setUserLookupMessage("");
      setUserInfo(null);
      setNome("");
      return;
    }

    let cancelled = false;
    setUserLookupState("searching");
    setUserLookupMessage("");

    const timeoutId = setTimeout(async () => {
      try {
        const userQuery = query(usersCol, where("matricula", "==", trimmed));
        const userSnap = await getDocs(userQuery);
        if (cancelled) {
          return;
        }

        if (userSnap.empty) {
          setUserLookupState("not_found");
          setUserLookupMessage("Matricula nao cadastrada.");
          setUserInfo(null);
          setNome("");
          sessionStorage.removeItem("matricula");
          sessionStorage.removeItem("nome");
          return;
        }

        const userDoc = userSnap.docs[0];
        const data = userDoc.data() as { nome?: string };
        const resolvedNome = data.nome?.trim() ?? "";

        setUserInfo({
          id: userDoc.id,
          matricula: trimmed,
          nome: resolvedNome,
        });
        setNome(resolvedNome);
        setUserLookupState("found");
        setUserLookupMessage("");
        sessionStorage.setItem("matricula", trimmed);
        if (resolvedNome) {
          sessionStorage.setItem("nome", resolvedNome);
        } else {
          sessionStorage.removeItem("nome");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(error);
        setUserLookupState("error");
        setUserLookupMessage("Erro ao buscar a matricula.");
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
    return templates.find((template) => template.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  const setResponse = (questionId: string, value: "ok" | "nc" | "na") => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { questionId, response: value },
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
    if (!userInfo || userLookupState !== "found" || userInfo.matricula !== trimmed) {
      throw new Error("Matricula nao cadastrada ou permitida.");
    }
    return {
      userId: userInfo.id,
      operatorName: userInfo.nome,
    };
  };

  const handleSubmit = async () => {
    if (!machine || !currentTemplate) {
      return;
    }

    try {
      const { userId, nome: nomeResolved } = await validateUser();

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

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Machine } from "@/types/machine";
import { ChecklistAnswer, ChecklistTemplate } from "@/types/checklist";

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

export default function ChecklistByTagPage() {
  const { tag } = useParams<Params>();
  const router = useRouter();

  const [state, setState] = useState<LoadState>("idle");
  const [machine, setMachine] = useState<Machine | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [matricula, setMatricula] = useState("");
  const [nome, setNome] = useState("");
  const [km, setKm] = useState<string>("");
  const [horimetro, setHorimetro] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>({});
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [userLookupState, setUserLookupState] = useState<LookupState>("idle");
  const [userLookupMessage, setUserLookupMessage] = useState<string>("");
  const [userInfo, setUserInfo] = useState<CachedUser | null>(null);

  const machinesCol = useMemo(() => collection(db, "machines"), []);
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
          throw new Error("Machine not found for the provided QR tag.");
        }
        const machineDoc = machineSnap.docs[0];
        const machineData = {
          id: machineDoc.id,
          ...(machineDoc.data() as Omit<Machine, "id">),
        } as Machine;
        setMachine(machineData);

        if (machineData.checklists?.length) {
          const fetched: ChecklistTemplate[] = [];
          for (const templateId of machineData.checklists) {
            const templateDoc = await getDoc(doc(db, "checklistTemplates", templateId));
            if (templateDoc.exists()) {
              fetched.push({
                id: templateDoc.id,
                ...(templateDoc.data() as Omit<ChecklistTemplate, "id">),
              });
            }
          }
          const activeTemplates = fetched.filter((template) => template.isActive);
          setTemplates(activeTemplates);
          if (activeTemplates.length) {
            setSelectedTemplateId(activeTemplates[0].id);
          }
        } else {
          setTemplates([]);
        }

        const savedMatricula = sessionStorage.getItem("matricula");
        const savedNome = sessionStorage.getItem("nome");
        if (savedMatricula) {
          setMatricula(savedMatricula);
        }
        if (savedNome) {
          setNome(savedNome);
        }

        setState("ready");
      } catch (error) {
        console.error(error);
        setState("error");
      }
    };

    load();
  }, [machinesCol, tag]);

  useEffect(() => {
    const trimmed = matricula.trim();

    if (!trimmed) {
      setUserLookupState("idle");
      setUserLookupMessage("");
      setUserInfo(null);
      setNome("");
      return;
    }

    let cancelled = false;
    setUserLookupState("searching");
    setUserLookupMessage("");

    const timeoutId = setTimeout(async () => {
      try {
        const userQuery = query(usersCol, where("matricula", "==", trimmed));
        const userSnap = await getDocs(userQuery);
        if (cancelled) {
          return;
        }

        if (userSnap.empty) {
          setUserLookupState("not_found");
          setUserLookupMessage("Matricula nao cadastrada.");
          setUserInfo(null);
          setNome("");
          sessionStorage.removeItem("matricula");
          sessionStorage.removeItem("nome");
          return;
        }

        const userDoc = userSnap.docs[0];
        const data = userDoc.data() as { nome?: string };
        const resolvedNome = data.nome?.trim() ?? "";

        setUserInfo({
          id: userDoc.id,
          matricula: trimmed,
          nome: resolvedNome,
        });
        setNome(resolvedNome);
        setUserLookupState("found");
        setUserLookupMessage("");
        sessionStorage.setItem("matricula", trimmed);
        if (resolvedNome) {
          sessionStorage.setItem("nome", resolvedNome);
        } else {
          sessionStorage.removeItem("nome");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(error);
        setUserLookupState("error");
        setUserLookupMessage("Erro ao buscar a matricula.");
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
    return templates.find((template) => template.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  const setResponse = (questionId: string, value: "ok" | "nc" | "na") => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { questionId, response: value },
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
    if (!userInfo || userLookupState !== "found" || userInfo.matricula !== trimmed) {
      throw new Error("Matricula nao cadastrada ou permitida.");
    }
    return {
      userId: userInfo.id,
      operatorName: userInfo.nome,
    };
  };

  const handleSubmit = async () => {
    if (!machine || !currentTemplate) {
      return;
    }

    try {
      const { userId, nome: nomeResolved } = await validateUser();

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

      if (kmValue !== ""
) {
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

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Machine } from "@/types/machine";
import { ChecklistAnswer, ChecklistTemplate } from "@/types/checklist";

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

export default function ChecklistByTagPage() {
  const { tag } = useParams<Params>();
  const router = useRouter();

  const [state, setState] = useState<LoadState>("idle");
  const [machine, setMachine] = useState<Machine | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [matricula, setMatricula] = useState("");
  const [nome, setNome] = useState("");
  const [km, setKm] = useState<string>("");
  const [horimetro, setHorimetro] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, ChecklistAnswer>>({});
  const [photos, setPhotos] = useState<Record<string, File | null>>({});
  const [userLookupState, setUserLookupState] = useState<LookupState>("idle");
  const [userLookupMessage, setUserLookupMessage] = useState<string>("");
  const [userInfo, setUserInfo] = useState<CachedUser | null>(null);

  const machinesCol = useMemo(() => collection(db, "machines"), []);
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
          throw new Error("Machine not found for the provided QR tag.");
        }
        const machineDoc = machineSnap.docs[0];
        const machineData = {
          id: machineDoc.id,
          ...(machineDoc.data() as Omit<Machine, "id">),
        } as Machine;
        setMachine(machineData);

        if (machineData.checklists?.length) {
          const fetched: ChecklistTemplate[] = [];
          for (const templateId of machineData.checklists) {
            const templateDoc = await getDoc(doc(db, "checklistTemplates", templateId));
            if (templateDoc.exists()) {
              fetched.push({
                id: templateDoc.id,
                ...(templateDoc.data() as Omit<ChecklistTemplate, "id">),
              });
            }
          }
          const activeTemplates = fetched.filter((template) => template.isActive);
          setTemplates(activeTemplates);
          if (activeTemplates.length) {
            setSelectedTemplateId(activeTemplates[0].id);
          }
        } else {
          setTemplates([]);
        }

        const savedMatricula = sessionStorage.getItem("matricula");
        const savedNome = sessionStorage.getItem("nome");
        if (savedMatricula) {
          setMatricula(savedMatricula);
        }
        if (savedNome) {
          setNome(savedNome);
        }

        setState("ready");
      } catch (error) {
        console.error(error);
        setState("error");
      }
    };

    load();
  }, [machinesCol, tag]);

  useEffect(() => {
    const trimmed = matricula.trim();

    if (!trimmed) {
      setUserLookupState("idle");
      setUserLookupMessage("");
      setUserInfo(null);
      setNome("");
      return;
    }

    let cancelled = false;
    setUserLookupState("searching");
    setUserLookupMessage("");

    const timeoutId = setTimeout(async () => {
      try {
        const userQuery = query(usersCol, where("matricula", "==", trimmed));
        const userSnap = await getDocs(userQuery);
        if (cancelled) {
          return;
        }

        if (userSnap.empty) {
          setUserLookupState("not_found");
          setUserLookupMessage("Matricula nao cadastrada.");
          setUserInfo(null);
          setNome("");
          sessionStorage.removeItem("matricula");
          sessionStorage.removeItem("nome");
          return;
        }

        const userDoc = userSnap.docs[0];
        const data = userDoc.data() as { nome?: string };
        const resolvedNome = data.nome?.trim() ?? "";

        setUserInfo({
          id: userDoc.id,
          matricula: trimmed,
          nome: resolvedNome,
        });
        setNome(resolvedNome);
        setUserLookupState("found");
        setUserLookupMessage("");
        sessionStorage.setItem("matricula", trimmed);
        if (resolvedNome) {
          sessionStorage.setItem("nome", resolvedNome);
        } else {
          sessionStorage.removeItem("nome");
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error(error);
        setUserLookupState("error");
        setUserLookupMessage("Erro ao buscar a matricula.");
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
    return templates.find((template) => template.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  const setResponse = (questionId: string, value: "ok" | "nc" | "na") => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { questionId, response: value },
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
    if (!userInfo || userLookupState !== "found" || userInfo.matricula !== trimmed) {
      throw new Error("Matricula nao cadastrada ou permitida.");
    }
    return {
      userId: userInfo.id,
      operatorName: userInfo.nome,
    };
  };

  const handleSubmit = async () => {
    if (!machine || !currentTemplate) {
      return;
    }

    try {
      const { userId, operatorName } = await validateUser();

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

        uploadedAnswers.push(answer);
      }

      const kmValue = km.trim();
      const horimetroValue = horimetro.trim();
      const operatorNameValue = operatorName.trim();

      const payload: {
        machineId: string;
        userId: string;
        templateId: string;
        createdAt: string;
        answers: ChecklistAnswer[];
        operatorName?: string;
        km?: number;
        horimetro?: number;
      } = {
        machineId: machine.id,
        userId,
        templateId: currentTemplate.id,
        createdAt: new Date().toISOString(),
        answers: uploadedAnswers,
      };

      if (operatorNameValue) {
        payload.operatorName = operatorNameValue;
      }

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
          <p className="text-red-400 font-semibold">
            Maquina nao encontrada pelo QR ou TAG.
          </p>
        </div>
      </div>
    );
  }

  const submitDisabled = !currentTemplate || userLookupState !== "found";

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">Checklist — {machine.modelo}</h1>
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
              {userLookupState === "searching" && (
                <p className="text-xs text-gray-400 mt-1">Buscando matricula...</p>
              )}
              {userLookupState === "not_found" && (
                <p className="text-xs text-red-400 mt-1">{userLookupMessage}</p>
              )}
              {userLookupState === "error" && (
                <p className="text-xs text-red-400 mt-1">{userLookupMessage}</p>
              )}
              {userLookupState === "found" && nome && (
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
          <h2 className="font-semibold">Dados da Operacao</h2>
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
              <label className="text-sm">Tipo de Checklist</label>
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
                {templates.length === 0 && (
                  <option>- sem templates vinculados -</option>
                )}
              </select>
            </div>
          </div>
        </section>

        <section className="bg-gray-800 p-4 rounded-xl space-y-4">
          <h2 className="font-semibold">Perguntas</h2>

          {currentTemplate ? (
            <div className="space-y-4">
              {currentTemplate.questions.map((question, index) => (
                <div
                  key={question.id}
                  className="p-3 bg-gray-900 rounded-lg border border-gray-700"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {index + 1}. {question.text}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        {(["ok", "nc", "na"] as const).map((value) => (
                          <label
                            key={value}
                            className="inline-flex items-center gap-2 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={`q-${question.id}`}
                              value={value}
                              onChange={() => setResponse(question.id, value)}
                              className="accent-blue-500"
                            />
                            <span className="uppercase">{value}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="min-w-40">
                      <label className="text-xs text-gray-400">
                        Foto {question.requiresPhoto ? "(obrigatoria para NC)" : "(opcional)"}
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(event) =>
                          onPhotoChange(question.id, event.target.files?.[0] || null)
                        }
                        className="block w-full text-xs mt-1 file:mr-3 file:py-1 file:px-2 file:rounded-md file:border-0 file:bg-gray-700 file:text-white hover:file:bg-gray-600"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Nenhum template selecionado ou vinculado.
            </p>
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






