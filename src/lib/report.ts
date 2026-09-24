import Papa from "papaparse";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface ExportPrediction {
  machineId: string;
  servicingProbability: number;
  riskLevel: string;
  keyIndicators: string[];
  recommendedAction: string;
  priorityScore: number;
}

const indicatorText = (indicators: unknown): string => {
  if (Array.isArray(indicators)) return indicators.join("; ");
  return String(indicators ?? "");
};

export const downloadCSVPredictions = (
  predictions: ExportPrediction[],
  fileNameBase: string
) => {
  const csv = Papa.unparse(
    predictions.map((p) => ({
      "Machine ID": p.machineId,
      "Servicing Probability": `${p.servicingProbability}%`,
      "Risk Level": p.riskLevel,
      "Priority Score": p.priorityScore,
      "Key Indicators": indicatorText(p.keyIndicators),
      "Recommended Action": p.recommendedAction,
    }))
  );

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileNameBase || "analysis-report"}-${new Date().toISOString()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

export const downloadPDFPredictions = (
  predictions: ExportPrediction[],
  summary: { totalMachines?: unknown; criticalMachines?: unknown; averageRisk?: unknown } | null,
  title: string,
  fileNameBase: string
) => {
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.text(title, 14, 20);

  doc.setFontSize(12);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);
  if (summary) {
    if (summary.totalMachines !== undefined)
      doc.text(`Total Machines: ${summary.totalMachines}`, 14, 37);
    if (summary.criticalMachines !== undefined)
      doc.text(`Critical Machines: ${summary.criticalMachines}`, 14, 44);
    if (summary.averageRisk !== undefined)
      doc.text(`Average Risk: ${summary.averageRisk}`, 14, 51);
  }

  autoTable(doc, {
    startY: summary ? 60 : 40,
    head: [["Machine ID", "Probability", "Risk", "Priority", "Action"]],
    body: predictions.map((p) => [
      p.machineId,
      `${p.servicingProbability}%`,
      p.riskLevel,
      p.priorityScore,
      p.recommendedAction,
    ]),
  });

  doc.save(`${fileNameBase || "analysis-report"}-${new Date().toISOString()}.pdf`);
};