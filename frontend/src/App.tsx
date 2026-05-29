import { TooltipProvider } from "@/components/ui/tooltip"
import { TopNav } from "@/components/layout/TopNav"
import { SummaryPanel } from "@/components/layout/SummaryPanel"
import { VideoPlayer } from "@/components/video-player"
import { BehaviorTimeline } from "@/components/behavior-timeline"
import { TracksSidebar } from "@/components/tracks-sidebar"
import { AnalyticsPanel } from "@/components/analytics"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { HotkeyLegend } from "@/components/layout/HotkeyLegend"

function AppContent() {
  useKeyboardShortcuts()

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <TopNav />

      <main className="grid flex-1 gap-3 p-3 [grid-template-areas:'banner'_'video'_'tracks'_'analytics'_'timeline'] md:[grid-template-areas:'video'_'tracks'_'analytics'_'timeline'] lg:grid-cols-[minmax(560px,1fr)_340px] lg:grid-rows-[auto_auto_auto] lg:[grid-template-areas:'video_tracks'_'video_analytics'_'timeline_timeline'] xl:grid-cols-[minmax(640px,1fr)_minmax(380px,440px)]">
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 md:hidden [grid-area:banner]">
          Optimized for desktop — narrow viewport may be limited.
        </div>

        <section className="flex min-w-0 flex-col gap-2 [grid-area:video]">
          <VideoPlayer />
          <SummaryPanel />
        </section>

        <section className="min-h-[280px] overflow-hidden rounded-md border border-zinc-800 [grid-area:tracks]">
          <TracksSidebar />
        </section>

        <section className="min-h-[280px] overflow-hidden rounded-md border border-zinc-800 [grid-area:analytics]">
          <AnalyticsPanel />
        </section>

        <section className="min-w-0 [grid-area:timeline]">
          <BehaviorTimeline />
        </section>
      </main>

      <HotkeyLegend />
    </div>
  )
}

function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <AppContent />
    </TooltipProvider>
  )
}

export default App
