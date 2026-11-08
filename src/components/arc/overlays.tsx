import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, CornerDownLeft, Search, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Toasts ---------- */
type T = { id: number; text: string; tone: "ok" | "err" };
const ToastCtx = React.createContext<(text: string, tone?: T["tone"]) => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);
export function Toaster({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<T[]>([]);
  const push = React.useCallback((text: string, tone: T["tone"] = "ok") => { const id = Date.now() + Math.random(); setItems((x) => [...x, { id, text, tone }]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3500); }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 end-4 z-[100] flex flex-col gap-2" role="status" aria-live="polite">
        <AnimatePresence>{items.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }} className="pointer-events-auto flex items-center gap-2 rounded-lg border border-ops-border bg-ops-card px-3.5 py-2.5 text-[13px] shadow-lg">
            {t.tone === "ok" ? <CheckCircle2 size={16} className="text-ops-green" /> : <TriangleAlert size={16} className="text-ops-red" />}{t.text}
          </motion.div>))}</AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Command palette (⌘K) ---------- */
export interface Cmd { id: string; label: string; hint?: string; icon?: React.ReactNode; run: () => void }
export function CommandPalette({ open, onOpenChange, commands }: { open: boolean; onOpenChange: (o: boolean) => void; commands: Cmd[] }) {
  const [q, setQ] = React.useState(""); const [i, setI] = React.useState(0);
  const list = commands.filter((c) => (c.label + " " + (c.hint ?? "")).toLowerCase().includes(q.toLowerCase()));
  React.useEffect(() => { setI(0); }, [q]); React.useEffect(() => { if (!open) setQ(""); }, [open]);
  const run = (c?: Cmd) => { if (!c) return; onOpenChange(false); c.run(); };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content aria-describedby={undefined} className="ops-root fixed start-1/2 top-[18vh] z-[91] w-[min(560px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-ops-border bg-ops-card shadow-2xl rtl:translate-x-1/2"
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, list.length - 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); } if (e.key === "Enter") run(list[i]); }}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-ops-border px-4"><Search size={15} className="text-ops-muted" /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a command or search…" aria-label="Search commands" className="h-12 flex-1 bg-transparent outline-none placeholder:text-ops-muted" /><kbd className="rounded border border-ops-border px-1.5 py-0.5 text-[10px] text-ops-muted">esc</kbd></div>
          <ul className="ops-scroll max-h-72 overflow-y-auto p-1.5" role="listbox">
            {list.map((c, n) => (
              <li key={c.id} role="option" aria-selected={n === i} onMouseEnter={() => setI(n)} onClick={() => run(c)} className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5", n === i && "bg-ops-hover")}>
                <span className="text-ops-muted">{c.icon}</span><span className="flex-1">{c.label}</span>{c.hint && <span className="text-xs text-ops-muted">{c.hint}</span>}{n === i && <CornerDownLeft size={13} className="text-ops-muted" />}
              </li>))}
            {!list.length && <li className="px-3 py-8 text-center text-ops-muted">No results</li>}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- Theme ---------- */
export function useTheme() {
  const [dark, setDark] = React.useState(() => localStorage.getItem("ops.theme") === "dark" || (!localStorage.getItem("ops.theme") && matchMedia("(prefers-color-scheme: dark)").matches));
  React.useEffect(() => { document.documentElement.classList.toggle("dark", dark); localStorage.setItem("ops.theme", dark ? "dark" : "light"); }, [dark]);
  return [dark, () => setDark((d) => !d)] as const;
}
