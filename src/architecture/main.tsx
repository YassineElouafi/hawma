import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { marked } from "marked";
import "../index.css";

const files = import.meta.glob("/docs/architecture/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const docs = Object.entries(files)
  .map(([path, src]) => {
    const slug = path.split("/").pop()!.replace(/\.md$/, "");
    const title = (src.match(/^#\s+(.+)$/m)?.[1] ?? slug).replace(/^Hawma — /, "");
    return { slug, title, src };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

marked.use({
  renderer: {
    code({ text, lang }) {
      if (lang === "mermaid") return `<div class="diagram" data-src="${encodeURIComponent(text)}"><div class="mermaid-slot"></div></div>`;
      const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
      return `<pre><code>${esc}</code></pre>`;
    },
    link({ href, text }) {
      const internal = /^\d\d-[\w-]+$/.test(href);
      return `<a href="${internal ? "#" + href : href}"${internal ? "" : ' target="_blank" rel="noreferrer"'}>${text}</a>`;
    },
  },
});

let mermaidP: Promise<typeof import("mermaid")["default"]> | null = null;
const getMermaid = () =>
  (mermaidP ??= import("mermaid").then((m) => {
    m.default.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      theme: "base",
      fontFamily: "Inter Variable, system-ui, sans-serif",
      themeVariables: { primaryColor: "#fffdf8", primaryBorderColor: "#0b3d33", primaryTextColor: "#14231f", lineColor: "#0b3d33", secondaryColor: "#f2b84b33", tertiaryColor: "#ece5d6", noteBkgColor: "#f2b84b55", noteTextColor: "#14231f" },
      flowchart: { htmlLabels: true, curve: "basis" },
    });
    return m.default;
  }));

function Doc({ slug }: { slug: string }) {
  const doc = docs.find((d) => d.slug === slug) ?? docs[0];
  const html = useMemo(() => marked.parse(doc.src) as string, [doc]);
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    (async () => {
      const mermaid = await getMermaid();
      const nodes = ref.current?.querySelectorAll<HTMLElement>(".diagram") ?? [];
      let i = 0;
      for (const n of nodes) {
        const code = decodeURIComponent(n.dataset.src!);
        try {
          const { svg } = await mermaid.render(`m-${doc.slug}-${i++}`, code);
          if (dead) return;
          n.querySelector(".mermaid-slot")!.innerHTML = svg;
          n.dataset.ok = "1";
        } catch (e) {
          n.querySelector(".mermaid-slot")!.innerHTML = `<pre class="mermaid-error">Diagram error: ${String((e as Error).message).slice(0, 300).replace(/</g, "&lt;")}</pre>`;
          n.dataset.ok = "0";
        }
      }
      document.body.dataset.rendered = doc.slug;
    })();
    return () => { dead = true; document.body.dataset.rendered = ""; };
  }, [doc, html]);

  return (
    <>
      <div ref={ref} className="doc" dangerouslySetInnerHTML={{ __html: html }}
        onClick={(e) => { const d = (e.target as HTMLElement).closest(".diagram"); if (d?.getAttribute("data-ok") === "1") setZoom(d.querySelector(".mermaid-slot")!.innerHTML); }} />
      {zoom && <Zoom svg={zoom} onClose={() => setZoom(null)} />}
    </>
  );
}

function Zoom({ svg, onClose }: { svg: string; onClose: () => void }) {
  const [s, setS] = useState(1);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="flex justify-end gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        {[["−", () => setS((x) => Math.max(.4, x - .2))], ["+", () => setS((x) => Math.min(4, x + .2))], ["✕", onClose]].map(([l, f]) => (
          <button key={l as string} onClick={f as () => void} className="h-10 w-10 rounded-full bg-white text-lg font-bold">{l as string}</button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-fit rounded-2xl bg-white p-6" style={{ zoom: s }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}

function Page() {
  const [slug, setSlug] = useState(() => location.hash.slice(1) || docs[0].slug);
  const [open, setOpen] = useState(false);
  useEffect(() => { const f = () => { setSlug(location.hash.slice(1) || docs[0].slug); window.scrollTo(0, 0); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <button className="rounded-lg border border-border px-3 py-1.5 text-sm lg:hidden" onClick={() => setOpen(!open)}>☰</button>
        <a href="/" className="flex items-center gap-2 font-display text-lg font-semibold"><span className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-saffron">ح</span>Hawma <span className="text-muted-foreground">· Architecture</span></a>
      </header>
      <div className="mx-auto flex max-w-[1400px]">
        <nav className={`${open ? "block" : "hidden"} fixed inset-x-0 top-[57px] z-20 max-h-[70vh] overflow-auto border-b border-border bg-background p-4 lg:sticky lg:top-[57px] lg:block lg:h-[calc(100dvh-57px)] lg:w-72 lg:flex-none lg:border-b-0 lg:border-e`}>
          {docs.map((d) => (
            <a key={d.slug} href={"#" + d.slug} onClick={() => setOpen(false)} className={`mb-1 block rounded-xl px-3 py-2 text-sm ${d.slug === slug ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted"}`}>{d.title}</a>
          ))}
        </nav>
        <main className="min-w-0 flex-1 px-4 py-8 lg:px-10"><Doc slug={slug} /></main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Page />);
