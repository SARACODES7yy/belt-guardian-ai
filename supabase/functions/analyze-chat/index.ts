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
    const { question, analysis } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");

    if (!GEMINI_API_KEY && !GROQ_API_KEY) {
      throw new Error("No AI provider configured. Set GEMINI_API_KEY or GROQ_API_KEY as a Supabase secret.");
    }

    if (!question || !analysis) {
      throw new Error("question and analysis are required");
    }

    const systemPrompt = `You are a predictive maintenance assistant for industrial conveyor belts and machinery.
You help operators understand AI analysis results and decide on actions.
Answer concisely (max ~150 words) and practically, referencing only the provided analysis data.
Never invent machines or metrics that are not in the context.`;

    const userPrompt = `Here is the machine analysis context:\n\n${JSON.stringify(analysis)}\n\nQuestion: ${question}`;

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
      attemptList.push({
        name: "groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: GROQ_API_KEY,
        model: "llama-3.3-70b-versatile",
      });
    }

    const requestBody = (model: string) => JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
    });

    let lastFailure = "no AI attempt succeeded";
    let answer: string | null = null;

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
      const content = data.choices?.[0]?.message?.content ?? "";
      if (!content) {
        lastFailure = `${attempt.name}/${attempt.model} -> empty response`;
        continue;
      }
      answer = content;
      break;
    }

    if (answer == null) {
      throw new Error(`AI gateway error (${lastFailure})`);
    }

    return new Response(
      JSON.stringify({ success: true, answer }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyze-chat:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});