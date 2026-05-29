import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { OverviewTab } from "./OverviewTab"
import { TrackingTab } from "./TrackingTab"
import { HeatmapTab } from "./HeatmapTab"
import { StatisticsTab } from "./StatisticsTab"
import { AnnotationsTab } from "./AnnotationsTab"
import { useAnnotationStore } from "@/stores/annotation-store"

export function AnalyticsPanel() {
  const annotationCount = useAnnotationStore((s) => s.behaviors.length)
  return (
    <div className="flex h-full flex-col">
      <Tabs defaultValue="annotations" className="flex h-full flex-col">
        <div className="border-b border-zinc-800 px-3 pt-1">
          <TabsList className="h-7 bg-transparent p-0">
            <TabsTrigger
              value="annotations"
              className="h-6 rounded-none border-b-2 border-transparent px-2 pb-0 text-[10px] data-[state=active]:border-zinc-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Annotations ({annotationCount})
            </TabsTrigger>
            <TabsTrigger
              value="overview"
              className="h-6 rounded-none border-b-2 border-transparent px-2 pb-0 text-[10px] data-[state=active]:border-zinc-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="tracking"
              className="h-6 rounded-none border-b-2 border-transparent px-2 pb-0 text-[10px] data-[state=active]:border-zinc-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Tracking
            </TabsTrigger>
            <TabsTrigger
              value="heatmap"
              className="h-6 rounded-none border-b-2 border-transparent px-2 pb-0 text-[10px] data-[state=active]:border-zinc-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Heatmap
            </TabsTrigger>
            <TabsTrigger
              value="statistics"
              className="h-6 rounded-none border-b-2 border-transparent px-2 pb-0 text-[10px] data-[state=active]:border-zinc-400 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Statistics
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="annotations" className="m-0 h-full">
            <AnnotationsTab />
          </TabsContent>
          <TabsContent value="overview" className="m-0 h-full">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="tracking" className="m-0 h-full">
            <TrackingTab />
          </TabsContent>
          <TabsContent value="heatmap" className="m-0 h-full">
            <HeatmapTab />
          </TabsContent>
          <TabsContent value="statistics" className="m-0 h-full">
            <StatisticsTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
