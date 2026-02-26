/**
 * BlogPostThread
 *
 * Mocked chat panel shown on the right side of /tasks when the
 * Blog Post Generator task is selected. Shows the agent generating
 * a blog post as a series of messages, with an embedded artifact
 * card that opens in /blog when clicked.
 */

import { useState } from "react";
import { Button } from "@deco/ui/components/button.tsx";
import { useNavigate } from "@tanstack/react-router";
import { useProjectContext } from "@decocms/mesh-sdk";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  File06,
  Send01,
} from "@untitledui/icons";

// ─── Blog post artifact ───────────────────────────────────────────────────────

function BlogArtifact({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Artifact header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <File06 size={13} className="text-violet-500" />
          <span className="text-xs font-medium text-foreground">
            Blog post draft
          </span>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors"
        >
          Open in Blog
          <ArrowUpRight size={11} />
        </button>
      </div>

      {/* Artifact preview */}
      <div className="px-4 py-3 flex flex-col gap-2">
        <p className="text-sm font-semibold text-foreground leading-snug">
          Best Smart Home Accessories Under $50
        </p>

        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          The smart home revolution is here — and it doesn&apos;t require a
          five-figure budget. With the right accessories, you can automate your
          home for under $50 per device and still get a seamless, connected
          experience.
        </p>

        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs text-muted-foreground">
            1,240 words · 5 min read
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <Check size={10} />
            SEO optimised
          </span>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="px-4 py-3 border-t border-border bg-muted/10">
        <Button size="sm" className="w-full" onClick={onOpen}>
          Review & approve draft
          <ArrowRight size={13} />
        </Button>
      </div>
    </div>
  );
}

// ─── Mocked messages ─────────────────────────────────────────────────────────

type Msg = { role: "agent" | "user"; text: string; artifact?: true };

const INITIAL_MESSAGES: Msg[] = [
  {
    role: "agent",
    text: "I'll write a blog post targeting **\"best smart home accessories under $50\"** — 18K monthly searches, low competition. Your brand voice is clear from the site analysis so I'll match the tone.",
  },
  {
    role: "agent",
    text: "Done. Here's your first draft:",
    artifact: true,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function BlogPostThread() {
  const { org, project } = useProjectContext();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  function handleOpenBlog() {
    navigate({
      to: "/$org/$project/blog",
      params: { org: org.slug, project: project.slug },
      search: { taskId: "bp-1" },
    });
  }

  function handleSend() {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { role: "user", text }]);
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          text: "Got it — I'll update the draft with that. Open the post to see the changes.",
        },
      ]);
      setSending(false);
    }, 900);
  }

  return (
    <div className="flex flex-col h-full border-l border-border bg-background">
      {/* Header */}
      <div className="flex-none flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-center size-7 rounded-lg bg-violet-100 text-violet-600 shrink-0">
          <File06 size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            Write: &quot;Best smart home accessories under $50&quot;
          </p>
          <p className="text-xs text-muted-foreground">Blog Post Generator</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {messages.map((msg, i) => (
          <div key={i} className="flex flex-col gap-2">
            {msg.role === "agent" ? (
              <div className="flex items-start gap-2">
                <div className="flex items-center justify-center size-6 rounded-full bg-violet-100 text-violet-600 shrink-0 mt-0.5">
                  <File06 size={11} />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  {/* Render **bold** manually */}
                  <p className="text-sm text-foreground leading-relaxed">
                    {msg.text
                      .split(/(\*\*[^*]+\*\*)/)
                      .map((part, j) =>
                        part.startsWith("**") ? (
                          <strong key={j}>{part.slice(2, -2)}</strong>
                        ) : (
                          part
                        ),
                      )}
                  </p>
                  {msg.artifact && <BlogArtifact onOpen={handleOpenBlog} />}
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-muted px-3 py-2 text-sm text-foreground">
                  {msg.text}
                </div>
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-start gap-2">
            <div className="flex items-center justify-center size-6 rounded-full bg-violet-100 text-violet-600 shrink-0 mt-0.5">
              <File06 size={11} />
            </div>
            <div className="flex items-center gap-1 py-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="size-1.5 rounded-full bg-muted-foreground animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-none px-4 py-3 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask to edit the draft..."
            rows={2}
            className="flex-1 resize-none rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-border"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            size="icon"
            className="size-9 shrink-0"
            disabled={!input.trim() || sending}
            onClick={handleSend}
          >
            <Send01 size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
