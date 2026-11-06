import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const v = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", {
  variants: { variant: { default: "bg-primary/10 text-primary", saffron: "bg-saffron/25 text-[#7a5200]", terracotta: "bg-terracotta/10 text-terracotta", outline: "border border-border text-muted-foreground" } },
  defaultVariants: { variant: "default" },
});
export const Badge = ({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof v>) => <span className={cn(v({ variant }), className)} {...p} />;
