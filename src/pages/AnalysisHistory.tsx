import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Trash2, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSVPredictions, downloadPDFPredictions, type ExportPrediction } from "@/lib/report";
import { useToast } from "@/hooks/use-toast";

interface PredictionRow {
  id: string;
  machine_id: string;
  servicing_probability: number;
  risk_level: string;
  key_indicators: unknown;
  recommended_action: string | null;
  priority_score: number | null;
}

interface AnalysisRow {
  id: string;
  user_id: string;
  file_name: string | null;
  created_at: string | null;
  summary: {
    totalMachines?: number;
    criticalMachines?: number;
    averageRisk?: string;
    recommendations?: string;
  } | null;
  predictions: PredictionRow[];
}

const riskChip = (risk: string) =>
  risk === "critical"
    ? "bg-status-critical/15 text-status-critical"
    : risk === "high" || risk === "medium"
    ? "bg-status-warning/15 text-status-warning"
    : "bg-status-operational/15 text-status-operational";

const AnalysisHistory = () => {
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalyses();
  }, []);

  const fetchAnalyses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("analyses")
      .select("*, predictions(*)")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setAnalyses((data ?? []) as unknown as AnalysisRow[]);
    }
    setLoading(false);
  };

  const toExportPredictions = (predictions: PredictionRow[]): ExportPrediction[] =>
    predictions.map((p) => ({
      machineId: p.machine_id,
      servicingProbability: Number(p.servicing_probability),
      riskLevel: p.risk_level,
      keyIndicators: (p.key_indicators as string[]) ?? [],
      recommendedAction: p.recommended_action ?? "",
      priorityScore: Number(p.priority_score ?? 0),
    }));

  const exportAnalysis = (analysis: AnalysisRow, type: "csv" | "pdf") => {
    const predictions = toExportPredictions(analysis.predictions);
    const base = `analysis-${analysis.id.slice(0, 8)}`;

    if (type === "csv") {
      downloadCSVPredictions(predictions, base);
    } else {
      downloadPDFPredictions(predictions, analysis.summary, "Machine Servicing Analysis Report", base);
    }
    toast({
      title: "Report Downloaded",
      description: `${analysis.file_name ?? "Analysis report"} exported.`,
    });
  };

  const deleteAnalysis = async (analysis: AnalysisRow) => {
    const { error } = await supabase.from("analyses").delete().eq("id", analysis.id);
    if (error) {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Analysis Deleted", description: `${analysis.file_name ?? "Analysis"} removed.` });
    fetchAnalyses();
  };

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-[1400px] space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-3xl font-bold uppercase tracking-[0.06em] md:text-4xl">
            Analysis history
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            Review and re-export your saved AI machine analyses
          </p>
        </header>

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-[6px]" />
            ))}
          </div>
        )}

        {!loading && analyses.length === 0 && (
          <Card className="p-10 text-center">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-4 text-lg font-medium">No analyses saved yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a CSV on the Upload Analysis page to generate and save machine predictions.
            </p>
          </Card>
        )}

        {!loading &&
          analyses.map((analysis) => {
            const isExpanded = expanded === analysis.id;
            const critical = analysis.predictions.filter(
              (p) => p.risk_level === "high" || p.risk_level === "critical"
            ).length;

            return (
              <Card key={analysis.id} className="overflow-hidden">
                <div className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
                  <div className="min-w-0 space-y-1">
                    <h2 className="truncate font-display text-lg font-semibold tracking-wide">
                      {analysis.file_name ?? `Analysis ${analysis.id.slice(0, 8)}`}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {analysis.created_at ? new Date(analysis.created_at).toLocaleString() : "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-[4px] bg-secondary px-1.5 py-px text-[11px] font-medium text-foreground/80">
                      {analysis.predictions.length} predictions
                    </span>
                    {critical > 0 && (
                      <span className="rounded-[4px] bg-status-critical/15 px-1.5 py-px text-[11px] font-medium text-status-critical">
                        {critical} critical
                      </span>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => setExpanded(isExpanded ? null : analysis.id)}>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground" onClick={() => exportAnalysis(analysis, "csv")}>
                      <Download className="h-4 w-4" /> CSV
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground" onClick={() => exportAnalysis(analysis, "pdf")}>
                      <Download className="h-4 w-4" /> PDF
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-status-critical"
                      onClick={() => deleteAnalysis(analysis)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {analysis.summary?.recommendations && (
                  <p className="border-l-2 border-status-info px-4 py-3 text-sm text-muted-foreground">
                    {analysis.summary.recommendations}
                  </p>
                )}

                {isExpanded && (
                  <div className="border-t border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Machine</TableHead>
                          <TableHead>Probability</TableHead>
                          <TableHead>Risk</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Recommended action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analysis.predictions.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium">{p.machine_id}</TableCell>
                            <TableCell>{p.servicing_probability}%</TableCell>
                            <TableCell>
                              <span className={riskChip(p.risk_level)}>{p.risk_level}</span>
                            </TableCell>
                            <TableCell>{p.priority_score ?? "—"}/10</TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.recommended_action ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
};

export default AnalysisHistory;