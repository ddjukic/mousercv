import { useVideoStore } from "@/stores/video-store"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

const SPEED_OPTIONS = ["0.25", "0.5", "1", "1.5", "2", "4"]

export function PlaybackControls() {
  const {
    isPlaying,
    currentFrame,
    totalFrames,
    currentTime,
    duration,
    playbackRate,
    togglePlaying,
    stepFrame,
    seekToFrame,
    setPlaybackRate,
    setCurrentTime,
  } = useVideoStore()

  const handleSeekSlider = (value: number[]) => {
    const frame = value[0]
    seekToFrame(frame)
  }

  const handleSeekToStart = () => {
    seekToFrame(0)
    setCurrentTime(0)
  }

  const handleSeekToEnd = () => {
    seekToFrame(totalFrames - 1)
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-2">
      {/* Seek slider */}
      <Slider
        value={[currentFrame]}
        min={0}
        max={totalFrames - 1}
        step={1}
        onValueChange={handleSeekSlider}
        className="w-full cursor-pointer"
      />

      {/* Controls row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleSeekToStart}
              >
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Go to start</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => stepFrame(-1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous frame (Left arrow)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={togglePlaying}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isPlaying ? "Pause" : "Play"} (Space)
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => stepFrame(1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next frame (Right arrow)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleSeekToEnd}
              >
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Go to end</TooltipContent>
          </Tooltip>
        </div>

        {/* Time display */}
        <div className="font-mono text-xs text-zinc-400">
          <span className="text-zinc-200">
            {formatTimecode(currentTime)}
          </span>
          <span className="mx-1.5 text-zinc-600">/</span>
          <span>{formatTimecode(duration)}</span>
        </div>

        {/* Speed selector */}
        <Select
          value={playbackRate.toString()}
          onValueChange={(v) => setPlaybackRate(parseFloat(v))}
        >
          <SelectTrigger className="h-7 w-20 border-zinc-800 bg-zinc-900 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEED_OPTIONS.map((speed) => (
              <SelectItem key={speed} value={speed} className="font-mono text-xs">
                {speed}x
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const f = Math.floor((seconds % 1) * 30)
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`
}
