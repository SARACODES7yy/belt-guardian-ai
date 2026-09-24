import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { machineData } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
      throw new Error("No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY as a Supabase secret.");
    }

    console.log('Analyzing machine data:', machineData.length, 'records');

    // Prepare data for AI analysis
    const dataPreview = machineData.slice(0, 10); // Send first 10 rows as sample
    const allData = machineData;

    const systemPrompt = `You are an expert in predictive maintenance for industrial machinery. 
Analyze the provided machine sensor data and predict servicing needs. 
Consider factors like: load percentage, speed, temperature, vibration, runtime hours, and historical maintenance patterns.

For each machine, provide:
1. Servicing probability (0-100%)
2. Risk level (low, medium, high, critical)
3. Key indicators that influenced the prediction
4. Recommended action
5. Priority score (1-10)`;

    const userPrompt = `Analyze this machine data and predict servicing requirements:
    
${JSON.stringify(dataPreview, null, 2)}

Total records: ${allData.length}

Provide predictions for ALL machines in the dataset.`;

    const attemptList: Array<{ name: string; url: string; key: string; model: string }> = [];
    if (GEMINI_API_KEY) {
      const url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
      attemptList.push(
        { name: "gemini", url, key: GEMINI_API_KEY, model: "gemini-flash-latest" },
        { name: "gemini", url, key: GEMINI_API_KEY, model: "gemini-3-flash-preview" },
        { name: "gemini", url, key: GEMINI_API_KEY, model: "gemini-2.5-flash" },
      );
    }
    if (GROQ_API_KEY) {
      const url = "https://api.groq.com/openai/v1/chat/completions";
      attemptList.push(
        { name: "groq", url, key: GROQ_API_KEY, model: "openai/gpt-oss-120b" },
        { name: "groq", url, key: GROQ_API_KEY, model: "openai/gpt-oss-20b" },
      );
    }

    const requestBody = (model: string) => JSON.stringify({
      model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "predict_servicing_needs",
              description: "Predict servicing requirements for machines based on sensor data",
              parameters: {
                type: "object",
                properties: {
                  predictions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        machineId: { type: "string" },
                        servicingProbability: { type: "number", minimum: 0, maximum: 100 },
                        riskLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
                        keyIndicators: { type: "array", items: { type: "string" } },
                        recommendedAction: { type: "string" },
                        priorityScore: { type: "number", minimum: 1, maximum: 10 }
                      },
                      required: ["machineId", "servicingProbability", "riskLevel", "keyIndicators", "recommendedAction", "priorityScore"],
                      additionalProperties: false
                    }
                  },
                  summary: {
                    type: "object",
                    properties: {
                      totalMachines: { type: "number" },
                      criticalMachines: { type: "number" },
                      averageRisk: { type: "string" },
                      recommendations: { type: "string" }
                    }
                  }
                },
                required: ["predictions", "summary"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "predict_servicing_needs" } }
    });

    let lastFailure = "no AI attempt succeeded";
    let result: Record<string, unknown> | null = null;

    for (const attempt of attemptList) {
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
      result = JSON.parse(toolCall.function.arguments);
      break;
    }

    if (!result) {
      throw new Error(`AI gateway error (${lastFailure})`);
    }

    return new Response(
      JSON.stringify({ success: true, analysis: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-machine-data:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
