import jsPDF from "jspdf";
import { ChecklistAnswer, ChecklistResponse, ChecklistTemplate } from "@/types/checklist";
import { Machine } from "@/types/machine";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR");

type ChecklistPdfDetail = {
  response: ChecklistResponse;
  machine?: Machine;
  template?: ChecklistTemplate;
};

type Preface = {
  title: string;
  subtitle?: string;
};

type AppendOptions = {
  preface?: Preface;
};

const sanitizeFilename = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "");

const formatAnswerResponse = (answer: ChecklistAnswer) => {
  switch (answer.response) {
    case "ok":
      return "Conforme";
    case "nc":
      return "Não conforme";
    case "na":
    default:
      return "Não se aplica";
  }
};

const appendChecklistToDoc = (doc: jsPDF, detail: ChecklistPdfDetail, options: AppendOptions = {}) => {
  const { response, machine, template } = detail;
  const margin = 14;
  const lineHeight = 6;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = margin;

  const ensureSpace = (linesNeeded = 1) => {
    if (y + lineHeight * linesNeeded > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addParagraph = (text: string, { bold = false, spacing = 0 }: { bold?: boolean; spacing?: number } = {}) => {
    if (!text) {
      y += spacing || lineHeight;
      return;
    }

    const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
    ensureSpace(lines.length);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    lines.forEach((line: string) => {
      doc.text(line, margin, y);
      y += lineHeight;
    });
    if (spacing) {
      y += spacing;
    }
  };

  if (options.preface) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    addParagraph(options.preface.title, { spacing: 2 });
    if (options.preface.subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      addParagraph(options.preface.subtitle, { spacing: 2 });
    }
    doc.setFontSize(16);
  } else {
    doc.setFontSize(16);
  }

  const templateTitle = template?.title ?? "Checklist";
  const machineLabel = machine
    ? `${machine.modelo}${machine.tag ? ` • TAG ${machine.tag}` : ""}`
    : response.machineId;

  doc.setFont("helvetica", "bold");
  addParagraph(`Checklist - ${templateTitle}`, { spacing: 2 });

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  addParagraph(`Checklist ID: ${response.id}`);
  addParagraph(`Máquina: ${machineLabel}`);
  addParagraph(`Data: ${dateTimeFormatter.format(new Date(response.createdAt))}`);

  if (response.operatorNome || response.operatorMatricula) {
    const operatorName = response.operatorNome ? response.operatorNome : "Não informado";
    const matriculaLabel = response.operatorMatricula ? ` (Mat. ${response.operatorMatricula})` : "";
    addParagraph(`Operador: ${operatorName}${matriculaLabel}`);
  }

  if (response.km != null || response.horimetro != null) {
    const parts = [] as string[];
    if (response.km != null) {
      parts.push(`KM ${response.km}`);
    }
    if (response.horimetro != null) {
      parts.push(`Hor ${response.horimetro}`);
    }
    addParagraph(`Leituras: ${parts.join(" • ")}`);
  }

  addParagraph("", { spacing: 2 });
  addParagraph("Perguntas", { bold: true, spacing: 2 });

  const questionTextById = new Map(
    (template?.questions ?? []).map((question) => [question.id, question.text]),
  );

  response.answers.forEach((answer, index) => {
    const questionTitle = questionTextById.get(answer.questionId) ?? answer.questionId;
    addParagraph(`${index + 1}. ${questionTitle}`, { bold: true });

    addParagraph(`Resposta: ${formatAnswerResponse(answer)}`);

    if (answer.observation) {
      addParagraph(`Observações: ${answer.observation}`);
    }

    if (answer.photoUrl) {
      addParagraph(`Foto: ${answer.photoUrl}`);
    }

    addParagraph("", { spacing: 2 });
  });
};

export const buildChecklistPdf = (detail: ChecklistPdfDetail) => {
  const doc = new jsPDF();
  appendChecklistToDoc(doc, detail);
  return doc;
};

export const saveChecklistPdf = (detail: ChecklistPdfDetail, filename?: string) => {
  const doc = buildChecklistPdf(detail);
  const baseName = filename
    ? sanitizeFilename(filename)
    : `checklist-${sanitizeFilename(detail.response.id)}-${detail.response.createdAt.slice(0, 10)}`;
  doc.save(`${baseName}.pdf`);
};

type MultipleChecklistOptions = {
  filename?: string;
  periodLabel?: { from?: string; to?: string };
};

export const saveMultipleChecklistsPdf = (
  details: ChecklistPdfDetail[],
  options: MultipleChecklistOptions = {},
) => {
  if (details.length === 0) {
    return;
  }

  const doc = new jsPDF();
  const { periodLabel } = options;

  details.forEach((detail, index) => {
    const preface: Preface | undefined =
      index === 0 && periodLabel
        ? {
            title: "Relatório de Checklists",
            subtitle: buildPeriodLabel(periodLabel),
          }
        : undefined;

    if (index > 0) {
      doc.addPage();
    }

    appendChecklistToDoc(doc, detail, { preface });
  });

  const baseName = options.filename
    ? sanitizeFilename(options.filename)
    : `checklists-${details.length}-${details[0].response.createdAt.slice(0, 10)}`;

  doc.save(`${baseName}.pdf`);
};

const buildPeriodLabel = (period?: { from?: string; to?: string }) => {
  if (!period) {
    return undefined;
  }

  const fromLabel = period.from ? dateFormatter.format(new Date(`${period.from}T00:00:00`)) : null;
  const toLabel = period.to ? dateFormatter.format(new Date(`${period.to}T00:00:00`)) : null;

  if (fromLabel && toLabel) {
    return `Período: ${fromLabel} a ${toLabel}`;
  }

  if (fromLabel) {
    return `Período iniciado em ${fromLabel}`;
  }

  if (toLabel) {
    return `Período até ${toLabel}`;
  }

  return undefined;
};
