import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AnalysisResult {
  summary: {
    totalMachines: number;
    criticalMachines: number;
    averageRisk: string;
    recommendations: string;
  };
  predictions: {
    machineId: string;
    servicingProbability: number;
    riskLevel: string;
    keyIndicators: string[];
    recommendedAction: string;
    priorityScore: number;
  }[];
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const suggestionQuestions = [
  "Which machine should I fix first and why?",
  "What is causing the most critical failures?",
  "What maintenance actions should I schedule this week?",
];

export const ChatPanel = ({ analysis }: { analysis: AnalysisResult }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendQuestion = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("analyze-chat", {
        body: { question: trimmed, analysis },
      });

      if (error) throw error;

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.answer ?? "I couldn't generate an answer." },
      ]);
    } catch (error) {
      toast({
        title: "Chat Failed",
        description: error instanceof Error ? error.message : "Failed to get an answer",
        variant: "destructive",
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-status-info" />
          <div>
            <h2 className="font-display text-xl font-semibold tracking-wide">
              Ask about this analysis
            </h2>
            <p className="text-sm text-muted-foreground">
              Get AI answers about the current machine predictions
            </p>
          </div>
        </div>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestionQuestions.map((q) => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                className="text-muted-foreground"
                disabled={loading}
                onClick={() => sendQuestion(q)}
              >
                {q}
              </Button>
            ))}
          </div>
        )}

        <ScrollArea className="h-72 rounded-[6px] border border-border p-4">
          <div className="space-y-3">
            {messages.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ask a question about this analysis, e.g. "Why is the second machine high risk?"
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex gap-2 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`flex gap-2 max-w-[85%] ${
                    message.role === "user"
                      ? "rounded-[8px] border border-primary/40 bg-secondary px-3 py-2"
                      : "rounded-[8px] border border-border bg-secondary/40 px-3 py-2"
                  }`}
                >
                  {message.role === "user" ? (
                    <User className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Bot className="mt-1 h-4 w-4 shrink-0 text-status-info" />
                  )}
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="flex gap-2 max-w-[85%] rounded-[8px] border border-border bg-secondary/40 px-3 py-2">
                  <Loader2 className="mt-1 h-4 w-4 shrink-0 text-status-info animate-spin" />
                  <p className="text-sm text-muted-foreground">Analyzing…</p>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this analysis…"
            className="min-h-[48px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendQuestion(input);
              }
            }}
          />
          <Button
            onClick={() => sendQuestion(input)}
            disabled={loading || !input.trim()}
            className="self-end gap-2"
          >
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    </Card>
  );
};