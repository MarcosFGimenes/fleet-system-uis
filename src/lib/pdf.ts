import jsPDF from "jspdf";
import JSZip from "jszip";
import {
  ChecklistAnswer,
  ChecklistResponse,
  ChecklistTemplate,
} from "@/types/checklist";
import { Machine } from "@/types/machine";
import {
  formatDateShort,
  getTemplateActorConfig,
  getTemplateHeader,
} from "@/lib/checklist";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

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
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^\.|\.$)/g, "")
    .trim();

const sanitizeComponent = (value: string) =>
  sanitizeFilename(value)
    .replace(/^-+/, "")
    .replace(/-+$/, "");

const parseResponseDate = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatResponseDate = (response: ChecklistResponse) => {
  const parsed = parseResponseDate(response.createdAt);
  if (!parsed) {
    return sanitizeComponent(response.createdAt).slice(0, 10) || "data";
  }
  return parsed.toISOString().slice(0, 10);
};

const formatResponseTimestamp = (response: ChecklistResponse) => {
  const parsed = parseResponseDate(response.createdAt);
  if (!parsed) {
    return sanitizeComponent(response.createdAt) || "registro";
  }
  const iso = parsed.toISOString();
  const datePart = iso.slice(0, 10).replace(/-/g, "");
  const timePart = iso.slice(11, 19).replace(/:/g, "");
  return `${datePart}-${timePart}`;
};

const buildChecklistDocumentBaseName = (detail: ChecklistPdfDetail, explicitName?: string) => {
  if (explicitName) {
    return sanitizeFilename(explicitName);
  }

  const plateSource = detail.machine?.placa ?? detail.machine?.tag ?? detail.response.machineId;
  const plate = plateSource ? sanitizeComponent(plateSource).toUpperCase() : "CHECKLIST";
  const timestampLabel = formatResponseTimestamp(detail.response);

  return `(${plate})-${timestampLabel}`;
};

const triggerDownload = (blob: Blob, filename: string) => {
  const safeName = sanitizeFilename(filename) || "download";
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

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

const getAnswerPhotoUrls = (answer: ChecklistAnswer) => {
  if (answer.photoUrls?.length) {
    return answer.photoUrls;
  }
  return answer.photoUrl ? [answer.photoUrl] : [];
};

const resolveImageFormat = (dataUrl: string) => {
  const match = /^data:(image\/[^;]+);/i.exec(dataUrl);
  if (!match) return "JPEG";
  const mime = match[1];
  if (mime.includes("png")) return "PNG";
  if (mime.includes("webp")) return "WEBP";
  return "JPEG";
};

const fetchImageDataUrl = async (url: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Erro ao ler imagem"));
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Falha ao carregar imagem do checklist", error);
    return null;
  }
};

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const formatNumericValue = (value: number | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return numberFormatter.format(value);
  }
  return "";
};

type HeaderSnapshot = {
  title: string;
  foNumber: string;
  issueDate: string;
  revision: string;
  documentNumber: string;
  lac: string;
  motorista: string;
  placa: string;
  kmAtual: number | null;
  kmAnterior: number | null;
  dataInspecao: string;
};

const resolveHeaderData = (detail: ChecklistPdfDetail): HeaderSnapshot => {
  const { response, template, machine } = detail;
  if (response.headerFrozen) {
    const frozen = response.headerFrozen;
    return {
      title: frozen.title || template?.title || "Checklist",
      foNumber: frozen.foNumber ?? "",
      issueDate: frozen.issueDate ?? "",
      revision: frozen.revision ?? "",
      documentNumber: frozen.documentNumber ?? "",
      lac: frozen.lac ?? "012",
      motorista: frozen.motorista ?? "",
      placa: frozen.placa ?? machine?.placa ?? "",
      kmAtual: typeof frozen.kmAtual === "number" ? frozen.kmAtual : null,
      kmAnterior: typeof frozen.kmAnterior === "number" ? frozen.kmAnterior : null,
      dataInspecao: frozen.dataInspecao ?? formatDateShort(new Date()),
    } satisfies HeaderSnapshot;
  }

  const templateHeader = getTemplateHeader(template);
  const actorConfig = getTemplateActorConfig(template);
  const parsedDate = parseResponseDate(response.createdAt) ?? new Date();
  const readingValue =
    typeof response.km === "number"
      ? response.km
      : typeof response.horimetro === "number"
      ? response.horimetro
      : null;
  const driverName =
    actorConfig.kind === "mecanico"
      ? response.actor?.driverNome ?? ""
      : response.actor?.driverNome ?? response.operatorNome ?? "";

  return {
    title: template?.title ?? "Checklist",
    foNumber: templateHeader.foNumber ?? "",
    issueDate: templateHeader.issueDate ?? "",
    revision: templateHeader.revision ?? "",
    documentNumber: templateHeader.documentNumber ?? "",
    lac: "012",
    motorista: driverName ?? "",
    placa: machine?.placa ?? "",
    kmAtual: readingValue,
    kmAnterior: typeof response.previousKm === "number" ? response.previousKm : null,
    dataInspecao: formatDateShort(parsedDate),
  } satisfies HeaderSnapshot;
};

const resolveActorKind = (detail: ChecklistPdfDetail): ChecklistTemplate["type"] => {
  return (
    detail.response.actor?.kind ??
    detail.template?.actor?.kind ??
    detail.template?.type ??
    "operador"
  );
};

const appendChecklistToDoc = async (
  doc: jsPDF,
  detail: ChecklistPdfDetail,
  options: AppendOptions = {},
) => {
  const { response, machine, template } = detail;
  const margin = 14;
  const lineHeight = 6;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const actorConfig = getTemplateActorConfig(template);
  const actorKind = resolveActorKind(detail);
  const headerData = resolveHeaderData(detail);

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

    const lines = doc.splitTextToSize(text, pageWidth - margin * 2) as string[];
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

  const drawHeaderCell = (
    x: number,
    width: number,
    yPos: number,
    height: number,
    label: string,
    value: string,
  ) => {
    doc.rect(x, yPos, width, height);
    const originalSize = doc.getFontSize();
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(label.toUpperCase(), x + 2, yPos + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const display = value ? String(value) : "";
    const lines = doc.splitTextToSize(display, width - 4) as string[];
    const baseY = yPos + height - 3 - (lines.length - 1) * 4;
    lines.forEach((line, index) => {
      doc.text(line, x + 2, baseY + index * 4);
    });
    doc.setFontSize(originalSize);
    doc.setFont("helvetica", "normal");
  };

  type SignatureBlock = {
    label: string;
    matricula: string;
    nome: string;
    signatureUrl: string | null;
    required: boolean;
  };

  const drawSignatureBlock = async (
    xPos: number,
    top: number,
    width: number,
    height: number,
    block: SignatureBlock,
  ) => {
    doc.rect(xPos, top, width, height);
    const labelY = top + 6;
    const originalSize = doc.getFontSize();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(block.label, xPos + width / 2, labelY, { align: "center", baseline: "middle" });

    const signatureTop = top + 10;
    const signatureHeight = 20;
    doc.setDrawColor(180);
    doc.line(xPos + 4, signatureTop + signatureHeight, xPos + width - 4, signatureTop + signatureHeight);
    doc.setDrawColor(0);

    if (block.signatureUrl) {
      const dataUrl = await fetchImageDataUrl(block.signatureUrl);
      if (dataUrl) {
        try {
          const format = resolveImageFormat(dataUrl);
          const props = doc.getImageProperties(dataUrl);
          const maxWidth = width - 8;
          const maxHeight = signatureHeight - 2;
          const ratio = Math.min(maxWidth / props.width, maxHeight / props.height, 1);
          const displayWidth = props.width * ratio;
          const displayHeight = props.height * ratio;
          const offsetX = xPos + (width - displayWidth) / 2;
          doc.addImage(dataUrl, format, offsetX, signatureTop, displayWidth, displayHeight);
        } catch (error) {
          console.error("Falha ao inserir assinatura no PDF", error);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.text("Assinatura indisponível", xPos + width / 2, signatureTop + signatureHeight - 4, {
            align: "center",
          });
        }
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text("Assinatura indisponível", xPos + width / 2, signatureTop + signatureHeight - 4, {
          align: "center",
        });
      }
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text("Assinatura", xPos + width / 2, signatureTop + signatureHeight - 4, {
        align: "center",
      });
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const matriculaText = block.matricula ? `Matrícula: ${block.matricula}` : "Matrícula: __________";
    const nomeText = block.nome ? `Nome: ${block.nome}` : "Nome: __________________";
    doc.text(matriculaText, xPos + 4, top + height - 10);
    doc.text(nomeText, xPos + 4, top + height - 4);
    doc.setFontSize(originalSize);
  };

  const renderSignatureSection = async () => {
    const blocks: SignatureBlock[] = [];
    const actorLabel =
      actorKind === "mecanico"
        ? "Mecânico"
        : actorKind === "motorista"
        ? "Motorista"
        : "Operador";

    const operatorMatricula =
      actorKind === "mecanico"
        ? response.actor?.mechanicMatricula ?? response.operatorMatricula ?? ""
        : response.operatorMatricula ?? "";
    const operatorNome =
      actorKind === "mecanico"
        ? response.actor?.mechanicNome ?? response.operatorNome ?? ""
        : response.operatorNome ?? "";

    blocks.push({
      label: `Assinatura do ${actorLabel.toLowerCase()}`,
      matricula: operatorMatricula,
      nome: operatorNome ?? "",
      signatureUrl: response.signatures?.operatorUrl ?? null,
      required: actorConfig.requireOperatorSignature ?? true,
    });

    const driverVisible =
      actorKind === "mecanico" ||
      (actorConfig.requireMotoristSignature ?? false) ||
      Boolean(response.actor?.driverNome) ||
      Boolean(response.signatures?.driverUrl) ||
      Boolean(headerData.motorista);

    if (driverVisible) {
      blocks.push({
        label: "Assinatura do motorista",
        matricula: response.actor?.driverMatricula ?? "",
        nome: response.actor?.driverNome ?? headerData.motorista ?? "",
        signatureUrl: response.signatures?.driverUrl ?? null,
        required: actorConfig.requireMotoristSignature ?? false,
      });
    }

    if (blocks.length === 0) {
      return;
    }

    const blockHeight = 48;
    const gap = blocks.length > 1 ? 12 : 0;
    const totalWidth = pageWidth - margin * 2;
    const blockWidth =
      blocks.length === 1
        ? totalWidth
        : (totalWidth - gap * (blocks.length - 1)) / blocks.length;

    const requiredHeight = Math.ceil((blockHeight + lineHeight + 4) / lineHeight);
    ensureSpace(requiredHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Assinaturas", margin, y);
    y += lineHeight;

    ensureSpace(Math.ceil(blockHeight / lineHeight) + 1);
    const top = y;
    for (let index = 0; index < blocks.length; index++) {
      const block = blocks[index];
      const xPos = margin + index * (blockWidth + gap);
      await drawSignatureBlock(xPos, top, blockWidth, blockHeight, block);
    }
    y = top + blockHeight + 6;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
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

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");

  const machineLabel = machine
    ? `${machine.modelo}${machine.tag ? ` • TAG ${machine.tag}` : ""}`
    : response.machineId;

  const logoWidth = 42;
  const row1Height = 18;
  const row2Height = 12;
  const row3Height = 14;
  const row4Height = 12;
  const headerHeight = row1Height + row2Height + row3Height + row4Height;
  const availableWidth = pageWidth - margin * 2;
  ensureSpace(Math.ceil(headerHeight / lineHeight) + 2);

  const headerTop = y;
  doc.setLineWidth(0.2);
  doc.rect(margin, headerTop, logoWidth, row1Height);
  doc.rect(margin + logoWidth, headerTop, availableWidth - logoWidth, row1Height);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("LAR", margin + logoWidth / 2, headerTop + row1Height / 2, {
    align: "center",
    baseline: "middle",
  });
  doc.setFontSize(10);
  doc.text(headerData.foNumber || "", margin + availableWidth - 2, headerTop + 6, {
    align: "right",
  });
  doc.setFont("helvetica", "normal");
  const emissionLabel = headerData.issueDate ? headerData.issueDate : "--/--/--";
  const revisionLabel = headerData.revision ? headerData.revision : "--/--/--";
  const documentLabel = headerData.documentNumber ? headerData.documentNumber : "-";
  doc.text(
    `EMISSÃO: ${emissionLabel}    REVISÃO: ${revisionLabel}    Nº: ${documentLabel}`,
    margin + logoWidth + 2,
    headerTop + row1Height - 4,
  );

  const titleY = headerTop + row1Height;
  doc.rect(margin, titleY, availableWidth, row2Height);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(headerData.title || "Checklist", margin + availableWidth / 2, titleY + row2Height / 2, {
    align: "center",
    baseline: "middle",
  });

  const row3Y = titleY + row2Height;
  const lacWidth = 30;
  const placaWidth = 45;
  const kmWidth = 40;
  const motoristaWidth = availableWidth - lacWidth - placaWidth - kmWidth;
  drawHeaderCell(margin, lacWidth, row3Y, row3Height, "Lac", headerData.lac || "012");
  drawHeaderCell(margin + lacWidth, motoristaWidth, row3Y, row3Height, "Motorista", headerData.motorista || "");
  drawHeaderCell(margin + lacWidth + motoristaWidth, placaWidth, row3Y, row3Height, "Placa", headerData.placa || "");
  drawHeaderCell(
    margin + lacWidth + motoristaWidth + placaWidth,
    kmWidth,
    row3Y,
    row3Height,
    "KM",
    formatNumericValue(headerData.kmAtual),
  );

  const row4Y = row3Y + row3Height;
  const kmAnteriorWidth = availableWidth * 0.6;
  const dataWidth = availableWidth - kmAnteriorWidth;
  drawHeaderCell(
    margin,
    kmAnteriorWidth,
    row4Y,
    row4Height,
    "Km anterior",
    formatNumericValue(headerData.kmAnterior),
  );
  drawHeaderCell(
    margin + kmAnteriorWidth,
    dataWidth,
    row4Y,
    row4Height,
    "Data inspeção",
    headerData.dataInspecao || "",
  );

  y = row4Y + row4Height + 8;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  addParagraph(`Checklist ID: ${response.id}`);
  addParagraph(`Máquina: ${machineLabel}`);
  addParagraph(`Emitido em: ${dateTimeFormatter.format(new Date(response.createdAt))}`);

  if (response.operatorNome || response.operatorMatricula) {
    const actorLabel =
      actorKind === "mecanico"
        ? "Mecânico"
        : actorKind === "motorista"
        ? "Motorista"
        : "Operador";
    const actorName = response.operatorNome ? response.operatorNome : "Não informado";
    const matriculaLabel = response.operatorMatricula ? ` (Mat. ${response.operatorMatricula})` : "";
    addParagraph(`${actorLabel}: ${actorName}${matriculaLabel}`);
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

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  addParagraph("", { spacing: 2 });
  addParagraph("Perguntas", { bold: true, spacing: 2 });

  const questionTextById = new Map(
    (template?.questions ?? []).map((question) => [question.id, question.text]),
  );

  for (let index = 0; index < response.answers.length; index++) {
    const answer = response.answers[index];
    const questionTitle = questionTextById.get(answer.questionId) ?? answer.questionId;
    addParagraph(`${index + 1}. ${questionTitle}`, { bold: true });

    addParagraph(`Resposta: ${formatAnswerResponse(answer)}`);

    if (answer.observation) {
      addParagraph(`Observações: ${answer.observation}`);
    }

    const photoUrls = getAnswerPhotoUrls(answer);
    if (photoUrls.length) {
      addParagraph(photoUrls.length > 1 ? "Fotos:" : "Foto:");
      for (const [photoIndex, photoUrl] of photoUrls.entries()) {
        const dataUrl = await fetchImageDataUrl(photoUrl);
        if (!dataUrl) {
          addParagraph("Não foi possível carregar a imagem anexada.");
          continue;
        }

        try {
          const format = resolveImageFormat(dataUrl);
          const { width, height } = doc.getImageProperties(dataUrl);
          const maxWidth = pageWidth - margin * 2;
          const ratio = Math.min(maxWidth / width, 120 / height, 1);
          const displayWidth = width * ratio;
          const displayHeight = height * ratio;
          const linesNeeded = Math.ceil(displayHeight / lineHeight) + 1;
          ensureSpace(linesNeeded);
          doc.addImage(dataUrl, format, margin, y, displayWidth, displayHeight);
          y += displayHeight + 2;
          addParagraph(`Figura ${photoIndex + 1}`, { spacing: 1 });
        } catch (error) {
          console.error("Falha ao inserir imagem no PDF", error);
          addParagraph("Não foi possível carregar a imagem anexada.");
        }
      }
    }

    if (answer.recurrence) {
      const recurrenceLabel =
        answer.recurrence.status === "still_nc"
          ? "Permanece em não conformidade"
          : "Operador informou que a não conformidade foi resolvida";
      addParagraph(`Reincidência: ${recurrenceLabel}`);
    }
    addParagraph("", { spacing: 2 });
  }

  await renderSignatureSection();
};

export const buildChecklistPdf = async (detail: ChecklistPdfDetail) => {
  const doc = new jsPDF();
  await appendChecklistToDoc(doc, detail);
  return doc;
};

export const saveChecklistPdf = async (detail: ChecklistPdfDetail, filename?: string) => {
  const doc = await buildChecklistPdf(detail);
  const baseName = buildChecklistDocumentBaseName(detail, filename);
  doc.save(`${baseName}.pdf`);
};

type ZipOptions = {
  filename?: string;
};

const getResponseTimestamp = (response: ChecklistResponse) => {
  const parsed = parseResponseDate(response.createdAt);
  return parsed ? parsed.getTime() : Number.POSITIVE_INFINITY;
};

export const downloadChecklistsZip = async (
  details: ChecklistPdfDetail[],
  options: ZipOptions = {},
) => {
  if (details.length === 0) {
    return;
  }

  const sortedDetails = [...details].sort((a, b) => getResponseTimestamp(a.response) - getResponseTimestamp(b.response));

  const zip = new JSZip();

  for (const detail of sortedDetails) {
    const doc = await buildChecklistPdf(detail);
    const pdfData = doc.output("arraybuffer");
    const filename = `${buildChecklistDocumentBaseName(detail)}.pdf`;
    zip.file(filename, pdfData);
  }

  const firstDetail = sortedDetails[0];
  const lastDetail = sortedDetails[sortedDetails.length - 1];
  const archiveLabel =
    options.filename ??
    (sortedDetails.length === 1
      ? `checklist-${formatResponseTimestamp(firstDetail.response)}`
      : `checklists-${formatResponseDate(firstDetail.response)}-a-${formatResponseDate(lastDetail.response)}`);
  const baseName = sanitizeFilename(archiveLabel) || "checklists";
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, `${baseName}.zip`);
};
