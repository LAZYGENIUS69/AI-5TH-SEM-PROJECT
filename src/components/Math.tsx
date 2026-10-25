import { useEffect, useState } from "react";

/**
 * Math.tsx — KaTeX renderer. KaTeX is loaded lazily (dynamic import) so the
 * dashboard bundle is not slowed by it. Rendering is safe: throwOnError is
 * off, trust is off, and any failure falls back to the plain-text formula.
 */

type KatexModule = typeof import("katex");

let katexPromise: Promise<KatexModule> | null = null;
function loadKatex(): Promise<KatexModule> {
  katexPromise ??= import("katex");
  return katexPromise;
}

export function Math({ tex, block = false }: { tex: string; block?: boolean }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadKatex()
      .then((katex) => {
        if (!alive) return;
        try {
          setHtml(
            katex.default.renderToString(tex, {
              throwOnError: false,
              trust: false,
              displayMode: block,
              output: "html",
            }),
          );
        } catch {
          setHtml(null);
        }
      })
      .catch(() => alive && setHtml(null));
    return () => {
      alive = false;
    };
  }, [tex, block]);

  if (html) {
    const rendered = (
      <span
        role="math"
        aria-label={tex}
        // KaTeX output with trust:false contains no scripts or links.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
    return block ? (
      <div className="overflow-x-auto py-2 text-center text-[1.05rem]">{rendered}</div>
    ) : (
      rendered
    );
  }

  // Fallback while KaTeX loads or if rendering fails: plain text, no raw LaTeX commands lost.
  return block ? (
    <code className="block overflow-x-auto py-2 text-center font-mono text-xs">{tex}</code>
  ) : (
    <code className="font-mono text-xs">{tex}</code>
  );
}
