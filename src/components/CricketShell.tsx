import { ReactNode } from "react";
import boundaryBrainsLogo from "@/assets/boundary-brains-logo.png";
export function CricketShell({
  children
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {/* Stadium lights */}
        <div className="absolute -top-32 left-1/2 h-[560px] w-[1080px] -translate-x-1/2 rounded-full bg-brand-glow opacity-40 blur-3xl" />
        <div className="absolute -top-10 left-[12%] h-[420px] w-[420px] rounded-full bg-brand-sun opacity-20 blur-3xl" />
        <div className="absolute bottom-[-260px] right-[-240px] h-[560px] w-[560px] rounded-full bg-brand-accent opacity-25 blur-3xl" />
      </div>

      <header className="relative z-10 border-b bg-card/60 backdrop-blur">
        <div className="container flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img
              src={boundaryBrainsLogo}
              alt="Boundary Brains logo"
              className="h-10 w-10 shrink-0 md:h-11 md:w-11"
              loading="eager"
              decoding="async"
            />

            <div className="leading-tight">
              <div className="text-base font-semibold tracking-wide text-foreground md:text-lg">
                BOUNDARY BRAINS
              </div>
              <div className="text-xs text-muted-foreground md:text-sm">
                SCS-AUTOPAY SMART QUIZ 2026
              </div>
            </div>
          </div>

          <div className="text-xs md:text-sm text-secondary-foreground">
            BE SMART & QUICK
          </div>
        </div>
      </header>

      <main className="relative z-10">{children}</main>

      <footer className="relative z-10 border-t bg-card/40 backdrop-blur">
        <div className="container py-6 text-xs text-muted-foreground">
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>Boundary Brains • SCS-AUTOPAY Smart Quiz 2026</div>
            <div>Tournament-grade • Live rounds • Fair play reminders enabled</div>
          </div>
        </div>
      </footer>
    </div>
  );
}