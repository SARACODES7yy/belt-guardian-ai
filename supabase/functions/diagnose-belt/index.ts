import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DiagnosticInput {
  belt: {
    id: string;
    name: string;
    location: string;
    status: string;
    speed: number | null;
    load_percentage: number | null;
    temperature: number | null;
    vibration: number | null;
    last_maintenance: string | null;
  };
  thresholds: Record<string, number | null> | null;
  recentReadings: Array<{
    timestamp: string;
    speed: number;
    load_percentage: number;
    temperature: number;
    vibration: number;
  }>;
  alerts: Array<{
    title: string;
    priority: string;
    status: string;
    created_at: string;
    description: string;
  }>;
  maintenanceLogs: Array<{
    maintenance_type: string;
    description: string | null;
    performed_at: string | null;
    downtime_hours: number | null;
    cost: number | null;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    const { belt, thresholds, recentReadings, alerts, maintenanceLogs }: DiagnosticInput = await req.json();

    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
      throw new Error("No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY as a Supabase secret.");
    }
    if (!belt) {
      throw new Error("belt is required");
    }

    // Try providers/models in order; first success wins. gemini-3.6-flash is
    // frequently at capacity (503), so fall through to alternates.
    const attempts: Array<{ name: string; url: string; key: string; model: string }> = [];
    if (GEMINI_API_KEY) {
      const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
      attempts.push(
        { name: "gemini", url, key: GEMINI_API_KEY, model: "gemini-flash-latest" },
        { name: "gemini", url, key: GEMINI_API_KEY, model: "gemini-3-flash-preview" },
        { name: "gemini", url, key: GEMINI_API_KEY, model: "gemini-2.5-flash" },
      );
    }
    if (GROQ_API_KEY) {
      const url = "https://api.groq.com/openai/v1/chat/completions";
      attempts.push(
        { name: "groq", url, key: GROQ_API_KEY, model: "openai/gpt-oss-120b" },
        { name: "groq", url, key: GROQ_API_KEY, model: "openai/gpt-oss-20b" },
      );
    }
    if (attempts.length === 0) {
      throw new Error("No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY as a Supabase secret.");
    }

    const systemPrompt = `You are an expert conveyor-belt reliability engineer performing a root-cause diagnostic.
You receive a belt's live sensor snapshot, its per-belt alert thresholds, recent sensor readings (trend), alert history, and maintenance records.
Investigate the evidence, correlate findings across sources, and produce a root-cause report.

Rules:
- riskScore is 0-100 (0 = perfectly healthy, 100 = imminent failure).
- status is a short operational verdict: "Stable", "Watch", "Degrading", "At Risk", or "Critical".
- rootCauses: concrete mechanical or operational anomalies found; if none, say the belt is operating normally.
- recommendedActions: specific, prioritized maintenance actions (empty array only if truly nothing to do).
- summary: 2-4 sentence executive summary citing the strongest evidence (days since service, trends, threshold breaches).
Base every claim on the provided data. If history is sparse, say so rather than inventing trends.`;

    const userPrompt = `Diagnose this conveyor belt:

BELT SNAPSHOT:
${JSON.stringify(belt, null, 2)}

ALERT THRESHOLDS (null = global defaults: vibration warn 5 / crit 7 mm/s, temp warn 55 / crit 65 C, load warn 80 / crit 90 %, speed below 2.5 m/s is anomalous):
${JSON.stringify(thresholds ?? {}, null, 2)}

RECENT READINGS (${recentReadings.length} in last 30 days, oldest first):
${JSON.stringify(recentReadings.slice(-100), null, 2)}

ALERT HISTORY:
${JSON.stringify(alerts, null, 2)}

MAINTENANCE RECORDS:
${JSON.stringify(maintenanceLogs, null, 2)}`;

    const requestBody = (model: string) => JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_belt_diagnostic",
            description: "Report the root-cause diagnostic for a conveyor belt",
            parameters: {
              type: "object",
              properties: {
                riskScore: { type: "number", minimum: 0, maximum: 100 },
                riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
                status: { type: "string" },
                rootCauses: { type: "array", items: { type: "string" } },
                recommendedActions: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["riskScore", "riskLevel", "status", "rootCauses", "recommendedActions", "summary"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "report_belt_diagnostic" } },
    });

    let lastFailure = "no AI attempt succeeded";
    let diagnostic: Record<string, unknown> | null = null;

    for (const attempt of attempts) {
      const response = await fetch(attempt.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${attempt.key}`,
          "Content-Type": "application/json",
        },
        body: requestBody(attempt.model),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`AI gateway error (${attempt.name}/${attempt.model}):`, response.status, errorText);
        lastFailure = `${attempt.name}/${attempt.model} -> ${response.status}: ${errorText.slice(0, 200)}`;
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Payment required. Please add credits to your workspace." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        continue;
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) {
        lastFailure = `${attempt.name}/${attempt.model} -> no tool call in response`;
        continue;
      }

      diagnostic = JSON.parse(toolCall.function.arguments);
      break;
    }

    if (!diagnostic) {
      return new Response(
        JSON.stringify({ error: "AI gateway error", detail: lastFailure }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, diagnostic }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in diagnose-belt:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
