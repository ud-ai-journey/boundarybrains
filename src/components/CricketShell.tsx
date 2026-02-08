import { ReactNode } from "react";

export function CricketShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-[520px] w-[980px] -translate-x-1/2 rounded-full bg-brand-glow opacity-35 blur-3xl" />
        <div className="absolute bottom-[-240px] right-[-220px] h-[520px] w-[520px] rounded-full bg-brand-accent opacity-20 blur-3xl" />
      </div>

      <header className="relative z-10 border-b bg-card/60 backdrop-blur">
        <div className="container flex items-center justify-between py-4">
          <div className="flex items-baseline gap-3">
            <div className="text-sm font-semibold tracking-wide text-foreground">
              SCS Auto Pay
            </div>
            <div className="hidden text-sm text-muted-foreground md:block">Smart Quiz 2026</div>
          </div>
          <div className="text-xs text-muted-foreground">Ninth Floor Cricket Tournament</div>
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t bg-card/40 backdrop-blur">
        <div className="container py-6 text-xs text-muted-foreground">
          Tournament-grade • Live rounds • Fair play reminders enabled
        </div>
      </footer>
    </div>
  );
}
