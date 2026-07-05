// Explicit class strings per person color so Tailwind's purge keeps them.
export interface ColorSet {
  accent: string; // top border / bar
  chip: string; // small pill background
  ring: string; // avatar ring
  glow: string; // subtle card tint
}

export const personColors: Record<string, ColorSet> = {
  rose: {
    accent: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-200 border-rose-500/30",
    ring: "ring-rose-400/50",
    glow: "from-rose-500/10",
  },
  sky: {
    accent: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-200 border-sky-500/30",
    ring: "ring-sky-400/50",
    glow: "from-sky-500/10",
  },
  violet: {
    accent: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-200 border-violet-500/30",
    ring: "ring-violet-400/50",
    glow: "from-violet-500/10",
  },
  emerald: {
    accent: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
    ring: "ring-emerald-400/50",
    glow: "from-emerald-500/10",
  },
  amber: {
    accent: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    ring: "ring-amber-400/50",
    glow: "from-amber-500/10",
  },
  slate: {
    accent: "bg-slate-500",
    chip: "bg-slate-500/15 text-slate-200 border-slate-500/30",
    ring: "ring-slate-400/50",
    glow: "from-slate-500/10",
  },
};

export function colorOf(name: string): ColorSet {
  return personColors[name] ?? personColors.slate;
}
