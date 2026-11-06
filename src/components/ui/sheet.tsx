import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bottom sheet built on Radix Dialog (shadcn-style). Renders inside `container` so it stays in the phone frame. */
export function Sheet({ open, onOpenChange, container, title, children, className }: {
  open: boolean; onOpenChange: (o: boolean) => void; container?: HTMLElement | null; title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container ?? undefined}>
        <Dialog.Overlay className="absolute inset-0 z-40 bg-emerald-950/50 backdrop-blur-sm" />
        <Dialog.Content asChild aria-describedby={undefined}>
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} transition={{ type: "spring", damping: 30, stiffness: 320 }}
            className={cn("absolute inset-x-0 bottom-0 z-50 flex max-h-[92%] flex-col rounded-t-[2rem] bg-background shadow-2xl outline-none", className)}>
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between px-5 pt-3">
              <Dialog.Title className="font-display text-xl font-semibold">{title}</Dialog.Title>
              <Dialog.Close className="rounded-full bg-muted p-2" aria-label="Close"><X size={16} /></Dialog.Close>
            </div>
            <div className="overflow-y-auto px-5 pb-6 pt-3">{children}</div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
