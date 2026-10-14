import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpenText, Leaf, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildContextBlock, retrieve, type RetrievedChunk } from "@/algorithms/ragEngine";
import { useFarm } from "@/hooks/useFarm";
import { CROP_WATER_PROFILES, SOIL_PROFILES } from "@/algorithms/weatherAdvisor";

export const Route = createFileRoute("/chat")({
  validateSearch: (search: Record<string, unknown>): { q?: string } =>
    typeof search["q"] === "string" && search["q"] ? { q: search["q"].slice(0, 300) } : {},
  head: () => ({
    meta: [
      { title: "Ask the Agronomist — grounded AI advisory | AgriSense" },
      {
        name: "description",
        content:
          "Ask crop questions and see the exact extension-guide passages retrieved before the AI answers.",
      },
      { property: "og:title", content: "Ask the Agronomist — grounded AI advisory" },
      {
        property: "og:description",
        content: "Retrieval-augmented crop advice with the source passages shown in the open.",
      },
    ],
  }),
  component: Chat,
});

const MESSAGES_KEY = "agrisense.chat.messages.v1";
const SOURCES_KEY = "agrisense.chat.sources.v1";

const SUGGESTIONS = [
  "How much nitrogen does wheat need and when?",
  "Yellow margins on my rice leaves — what is it?",
  "Can I save water on paddy without losing yield?",
  "My soil pH is 8.6. What should I change?",
];

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function Chat() {
  const { farm } = useFarm();
  const [initial] = useState(() => readStored<UIMessage[]>(MESSAGES_KEY, []));
  const [sources, setSources] = useState<Record<string, RetrievedChunk[]>>(() =>
    readStored<Record<string, RetrievedChunk[]>>(SOURCES_KEY, {}),
  );
  const { q } = Route.useSearch();
  const [input, setInput] = useState(q ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, setMessages } = useChat({
    id: "agrisense-advisor",
    messages: initial,
    transport,
    onError: (error) => toast.error(error.message || "The advisor could not answer just now."),
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SOURCES_KEY, JSON.stringify(sources));
    } catch {
      /* ignore */
    }
  }, [sources]);

  useEffect(() => {
    if (status === "ready") textareaRef.current?.focus();
  }, [status]);

  const farmBlock = useMemo(() => {
    const crop = CROP_WATER_PROFILES.find((c) => c.id === farm.cropId)?.name ?? farm.cropId;
    const soil = SOIL_PROFILES.find((s) => s.id === farm.soilId)?.name ?? farm.soilId;
    return `Location: ${farm.placeName}. Crop: ${crop}. Soil: ${soil}. Growth stage: ${farm.stage}. Area: ${farm.areaHa} ha.`;
  }, [farm]);

  const ask = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || status === "streaming" || status === "submitted") return;
      const { results } = retrieve(question);
      const key = `q:${messages.length}`;
      setSources((prev) => ({ ...prev, [key]: results }));
      setInput("");
      void sendMessage(
        { text: question },
        { body: { context: buildContextBlock(results), farm: farmBlock } },
      );
    },
    [farmBlock, messages.length, sendMessage, status],
  );

  const reset = () => {
    setMessages([]);
    setSources({});
    try {
      window.localStorage.removeItem(MESSAGES_KEY);
      window.localStorage.removeItem(SOURCES_KEY);
    } catch {
      /* ignore */
    }
  };

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Ask the agronomist</h1>
          <p className="text-sm text-muted-foreground">
            Every answer shows the extension-guide passages it was built from.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={reset}>
          <RotateCcw className="size-4" /> New conversation
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <Conversation className="h-[60vh]">
          <ConversationContent>
            {messages.length === 0 && (
              <ConversationEmptyState
                icon={
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Leaf className="size-6" />
                  </span>
                }
                title="Ask about your crop"
                description="Nutrition, pests, irrigation, soil health — answers are grounded in indexed extension guidance."
              >
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <Button key={s} variant="secondary" size="sm" onClick={() => ask(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </ConversationEmptyState>
            )}

            {messages.map((message, index) => {
              const text = message.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("");
              const retrieved = sources[`q:${index}`];
              return (
                <div key={message.id} className="space-y-2">
                  {message.role === "user" && retrieved && retrieved.length > 0 && (
                    <div className="rounded-xl border border-border bg-muted/50 p-3">
                      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <BookOpenText className="size-3.5" /> Retrieved evidence
                      </p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {retrieved.map((c, i) => (
                          <article key={c.id} className="rounded-lg border border-border bg-card p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[10px] text-primary">[{i + 1}]</span>
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {c.score.toFixed(3)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs font-semibold leading-tight">{c.source}</p>
                            <p className="text-[11px] text-muted-foreground">{c.section}</p>
                            <p className="mt-1 line-clamp-4 text-[11px] leading-snug text-muted-foreground">
                              {c.text}
                            </p>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                  <Message from={message.role}>
                    <MessageContent>
                      {message.role === "assistant" ? (
                        <MessageResponse>{text}</MessageResponse>
                      ) : (
                        <p className="whitespace-pre-wrap">{text}</p>
                      )}
                    </MessageContent>
                  </Message>
                </div>
              );
            })}

            {status === "submitted" && <Shimmer>Retrieving guidance and drafting advice…</Shimmer>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="border-t border-border p-3">
          <PromptInput
            onSubmit={(message, event) => {
              event.preventDefault();
              ask(message.text ?? input);
            }}
          >
            <PromptInputTextarea
              ref={textareaRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about nutrition, pests, irrigation or soil…"
            />
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit status={status} disabled={isBusy || input.trim().length === 0} />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
