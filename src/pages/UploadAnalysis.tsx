import { useState } from "react";
import { Upload, Download, AlertCircle, CheckCircle } from "lucide-react";
import Papa from "papaparse";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { useRole } from "@/hooks/useRole";
import { ChatPanel } from "@/components/analysis/ChatPanel";
import { downloadCSVPredictions, downloadPDFPredictions } from "@/lib/report";

interface MachineData {
  [key: string]: string | number;
}

interface Prediction {
  machineId: string;
  servicingProbability: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  keyIndicators: string[];
  recommendedAction: string;
  priorityScore: number;
}

interface AnalysisResult {
  predictions: Prediction[];
  summary: {
    totalMachines: number;
    criticalMachines: number;
    averageRisk: string;
    recommendations: string;
  };
}

const riskBarColor = (riskLevel: string) =>
  riskLevel === "critical"
    ? "hsl(var(--status-critical))"
    : riskLevel === "high"
    ? "hsl(var(--status-warning))"
    : riskLevel === "medium"
    ? "hsl(var(--status-warning))"
    : "hsl(var(--status-operational))";

const riskChip = (riskLevel: string) =>
  riskLevel === "critical"
    ? "bg-status-critical/15 text-status-critical"
    : riskLevel === "high"
    ? "bg-status-warning/15 text-status-warning"
    : riskLevel === "medium"
    ? "bg-status-warning/15 text-status-warning"
    : "bg-status-operational/15 text-status-operational";

const UploadAnalysis = () => {
  const [uploadedData, setUploadedData] = useState<MachineData[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState("");
  const { canManage } = useRole();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);

    Papa.parse(file, {
      complete: async (results) => {
        try {
          const data = results.data as MachineData[];
          setUploadedData(data.filter(row => Object.values(row).some(val => val !== "")));
          
          const { data: analysisData, error } = await supabase.functions.invoke(
            "analyze-machine-data",
            {
              body: { machineData: data }
            }
          );

          if (error) throw error;

          const analysis = analysisData.analysis as AnalysisResult;
          setAnalysis(analysis);

          const { data: { user } } = await supabase.auth.getUser();
          const { data: analysisRow, error: rowError } = await supabase
            .from("analyses")
            .insert({
              user_id: user?.id,
              file_name: file.name,
              summary: analysis.summary as unknown as Json,
            })
            .select()
            .single();

          if (rowError) throw rowError;

          const predictionsRows = analysis.predictions.map((p) => ({
            analysis_id: analysisRow.id,
            machine_id: p.machineId,
            servicing_probability: p.servicingProbability,
            risk_level: p.riskLevel,
            key_indicators: p.keyIndicators,
            recommended_action: p.recommendedAction,
            priority_score: p.priorityScore,
          }));

          const { error: predError } = await supabase
            .from("predictions")
            .insert(predictionsRows);

          if (predError) throw predError;

          if (canManage) {
            const critical = analysis.predictions.filter(
              (p) => p.riskLevel === "high" || p.riskLevel === "critical"
            );
            for (const p of critical) {
              await supabase.from("work_orders").insert({
                title: `Servicing required: ${p.machineId}`,
                description: p.recommendedAction,
                priority: p.riskLevel === "critical" ? "critical" : "high",
                created_by: user?.id ?? null,
                due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              });
            }
            if (critical.length > 0) {
              toast({
                title: "Work Orders Created",
                description: `${critical.length} maintenance work order(s) created from critical predictions.`,
              });
            }
          } else if (analysis.predictions.some((p) => p.riskLevel === "high" || p.riskLevel === "critical")) {
            toast({
              title: "Work Orders Skipped",
              description: "Sign in as an operator or admin to auto-create work orders.",
            });
          }

          toast({
            title: "Analysis Complete",
            description: "Machine servicing predictions have been generated and saved.",
          });
        } catch (error) {
          console.error("Analysis error:", error);
          toast({
            title: "Analysis Failed",
            description: error instanceof Error ? error.message : "Failed to analyze data",
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
      },
      header: true,
      skipEmptyLines: true,
    });
  };

  const downloadCSV = () => {
    if (!analysis) return;

    downloadCSVPredictions(analysis.predictions, "analysis-report");
    toast({
      title: "Report Downloaded",
      description: "CSV report has been downloaded successfully.",
    });
  };

  const downloadPDF = () => {
    if (!analysis) return;

    downloadPDFPredictions(
      analysis.predictions,
      analysis.summary,
      "Machine Servicing Analysis Report",
      "analysis-report"
    );
    toast({
      title: "Report Downloaded",
      description: "PDF report has been downloaded successfully.",
    });
  };

  const summaryCells = [
    { label: "Total machines", value: analysis?.summary.totalMachines, tone: "" },
    { label: "Critical machines", value: analysis?.summary.criticalMachines, tone: "text-status-critical" },
    { label: "Average risk", value: analysis?.summary.averageRisk, tone: "capitalize" },
  ];

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-bold uppercase tracking-[0.06em] md:text-4xl">
            Machine analysis
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Upload CSV data for AI-powered servicing predictions
          </p>
        </header>

        <Card className="p-6">
          <label
            className={`flex w-full cursor-pointer flex-col items-center justify-center rounded-[6px] border-2 border-dashed border-border bg-secondary/30 px-6 py-12 transition-colors hover:border-primary/60 hover:bg-secondary/50 ${
              loading ? "pointer-events-none opacity-70" : ""
            }`}
          >
            <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-foreground">
              <span className="font-medium">Choose a CSV file</span> to analyze
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Machine readings with sensor columns</p>
            {fileName && (
              <p className="mt-3 font-display text-sm font-semibold tracking-wide text-status-info">
                {fileName}
              </p>
            )}
            <input
              type="file"
              className="hidden"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={loading}
            />
          </label>

          {loading && (
            <div className="mt-5 space-y-2">
              <p className="text-sm text-muted-foreground">Analyzing data with AI…</p>
              <div className="h-1 overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-status-info" />
              </div>
            </div>
          )}
        </Card>

        {analysis && (
          <>
            <Card className="p-6">
              <h2 className="font-display text-xl font-semibold tracking-wide">Analysis summary</h2>
              <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-[6px] border border-border bg-border md:grid-cols-4">
                {summaryCells.map((cell) => (
                  <div key={cell.label} className="bg-card p-4">
                    <p className={`readout text-2xl ${cell.tone}`}>{cell.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{cell.label}</p>
                  </div>
                ))}
                <div className="flex items-center justify-center gap-2 bg-card p-4">
                  <Button variant="outline" size="sm" onClick={downloadCSV}>
                    <Download className="h-4 w-4" />
                    CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadPDF}>
                    <Download className="h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
              <Alert className="mt-4">
                <AlertDescription>{analysis.summary.recommendations}</AlertDescription>
              </Alert>
            </Card>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {analysis.predictions.map((prediction, index) => (
                <Card key={index} className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <h3 className="truncate font-display text-lg font-semibold tracking-wide">
                          {prediction.machineId}
                        </h3>
                        <span className={riskChip(prediction.riskLevel)}>{prediction.riskLevel}</span>
                      </div>
                      <div className="text-right">
                        <p className="readout text-2xl">{prediction.servicingProbability}%</p>
                        <p className="text-xs text-muted-foreground">servicing probability</p>
                      </div>
                    </div>

                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${prediction.servicingProbability}%`,
                          backgroundColor: riskBarColor(prediction.riskLevel),
                        }}
                      />
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-medium">Key indicators</p>
                      <div className="flex flex-wrap gap-2">
                        {prediction.keyIndicators.map((indicator, idx) => (
                          <span
                            key={idx}
                            className="rounded-[4px] border border-border px-1.5 py-px text-xs text-muted-foreground"
                          >
                            {indicator}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[6px] border border-border p-3">
                      <p className="mb-1 text-sm font-medium">Recommended action</p>
                      <p className="text-sm text-muted-foreground">
                        {prediction.recommendedAction}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <span className="text-sm text-muted-foreground">Priority score</span>
                      <span className="readout text-lg">{prediction.priorityScore}/10</span>
                    </div>

                    <div className="flex justify-center">
                      {prediction.riskLevel === "low" ? (
                        <CheckCircle
                          className="h-12 w-12 text-status-operational"
                          strokeWidth={1.5}
                        />
                      ) : (
                        <AlertCircle
                          className={`h-12 w-12 stroke-1 ${
                            prediction.riskLevel === "critical"
                              ? "text-status-critical"
                              : "text-status-warning"
                          }`}
                        />
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <ChatPanel analysis={analysis} />
          </>
        )}

        {uploadedData.length > 0 && !analysis && !loading && (
          <Card className="p-6">
            <h2 className="font-display text-xl font-semibold tracking-wide">Uploaded data preview</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {Object.keys(uploadedData[0]).map((key) => (
                      <th key={key} className="p-2 text-left font-medium text-muted-foreground">
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {uploadedData.slice(0, 5).map((row, index) => (
                    <tr key={index} className="border-b border-border">
                      {Object.values(row).map((value, idx) => (
                        <td key={idx} className="p-2 text-muted-foreground">
                          {String(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {uploadedData.length > 5 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Showing 5 of {uploadedData.length} rows
                </p>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default UploadAnalysis;