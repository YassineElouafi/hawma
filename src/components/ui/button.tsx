import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all active:scale-[.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-emerald-950",
        accent: "bg-saffron text-foreground shadow-lg shadow-saffron/30 hover:brightness-105",
        terracotta: "bg-terracotta text-white shadow-lg shadow-terracotta/30 hover:brightness-105",
        outline: "border border-border bg-card hover:bg-muted",
        ghost: "hover:bg-muted",
        whatsapp: "bg-[#25D366] text-white hover:brightness-105",
        glass: "bg-white/10 text-white backdrop-blur border border-white/20 hover:bg-white/20",
      },
      size: { default: "h-11 px-6", sm: "h-9 px-4 text-xs", lg: "h-14 px-8 text-base", icon: "h-10 w-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...p }, ref) => {
  const C = asChild ? Slot : "button";
  return <C ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...p} />;
});
Button.displayName = "Button";
