import * as React from "react"
import { useTranslation } from "react-i18next"
import { dateUtils } from "@/lib/dateFormatter"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const CHART_WIDTH = 720
const CHART_HEIGHT = 220
const PAD_X = 34
const PAD_TOP = 14
const PAD_BOTTOM = 32

const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(sizes.length - 1, Math.max(0, Math.floor(Math.log(bytes) / Math.log(k))))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

const getDisplayUnit = (maxBytes: number) => {
  const units = [
    { label: "TB", divisor: 1024 ** 4 },
    { label: "GB", divisor: 1024 ** 3 },
    { label: "MB", divisor: 1024 ** 2 },
    { label: "KB", divisor: 1024 },
  ]
  return units.find((unit) => maxBytes >= unit.divisor) ?? { label: "B", divisor: 1 }
}

interface TrafficDataPoint {
  period_start: string
  total_traffic: number
}

interface TrafficChartProps {
  data: TrafficDataPoint[]
  isLoading?: boolean
  error?: Error | null
  timeRange?: string
  onTimeRangeChange?: (range: string) => void
}

interface PlotPoint {
  x: number
  y: number
  bytes: number
  periodStart: string
  value: number
}

const formatPeriodLabel = (value: string, timeRange: string, language: string) => {
  const d = dateUtils.toDayjs(value)
  const shortRange = timeRange === "1h" || timeRange === "12h" || timeRange === "24h"
  try {
    if (language === "fa") {
      return shortRange
        ? d.toDate().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", hour12: false })
        : d.toDate().toLocaleDateString("fa-IR", { month: "short", day: "numeric" })
    }
    return shortRange ? d.format("HH:mm") : d.format("MMM D")
  } catch {
    return shortRange ? d.format("HH:mm") : d.format("MM/DD")
  }
}

const formatTooltipDate = (value: string, timeRange: string, language: string) => {
  const d = dateUtils.toDayjs(value)
  const shortRange = timeRange === "1h" || timeRange === "12h" || timeRange === "24h"
  try {
    if (language === "fa") {
      return shortRange
        ? d.toDate().toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", hour12: false })
        : d.toDate().toLocaleDateString("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit" })
    }
    return shortRange ? d.format("YYYY/MM/DD HH:mm") : d.format("YYYY/MM/DD")
  } catch {
    return shortRange ? d.format("YYYY/MM/DD HH:mm") : d.format("YYYY/MM/DD")
  }
}

const buildSmoothPath = (points: PlotPoint[]) => {
  if (!points.length) return ""
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1]
    const current = points[i]
    const mid = (previous.x + current.x) / 2
    path += ` C ${mid} ${previous.y}, ${mid} ${current.y}, ${current.x} ${current.y}`
  }
  return path
}

export const TrafficChart = React.memo(function TrafficChart({
  data,
  isLoading = false,
  error,
  timeRange = "7d",
  onTimeRangeChange,
}: TrafficChartProps) {
  const { t, i18n } = useTranslation()
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null)

  const displayUnit = React.useMemo(() => {
    const maxBytes = Math.max(...(data ?? []).map((point) => point.total_traffic), 0)
    return getDisplayUnit(maxBytes)
  }, [data])

  const values = React.useMemo(
    () => (data ?? []).map((point) => Math.max(0, point.total_traffic / displayUnit.divisor)),
    [data, displayUnit.divisor],
  )
  const maxValue = Math.max(...values, 0)
  const safeMax = maxValue > 0 ? maxValue : 1
  const plotWidth = CHART_WIDTH - PAD_X * 2
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM

  const points = React.useMemo<PlotPoint[]>(() => {
    const count = Math.max(1, (data ?? []).length - 1)
    return (data ?? []).map((point, index) => {
      const value = Math.max(0, point.total_traffic / displayUnit.divisor)
      return {
        x: PAD_X + (index / count) * plotWidth,
        y: PAD_TOP + plotHeight - (value / safeMax) * plotHeight,
        bytes: point.total_traffic,
        periodStart: point.period_start,
        value,
      }
    })
  }, [data, displayUnit.divisor, plotHeight, plotWidth, safeMax])

  const linePath = React.useMemo(() => buildSmoothPath(points), [points])
  const areaPath = React.useMemo(() => {
    if (!points.length) return ""
    const baseline = PAD_TOP + plotHeight
    return `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
  }, [linePath, plotHeight, points])

  const totalUsedBytes = React.useMemo(
    () => data?.reduce((sum, point) => sum + point.total_traffic, 0) ?? 0,
    [data],
  )

  const timeRangeOptions = React.useMemo(() => ([
    { value: "24h", label: t("timeRange.24h") || "24h" },
    { value: "7d", label: t("timeRange.7d") || "7d" },
    { value: "30d", label: t("timeRange.30d") || "30d" },
  ]), [t])

  const xLabelIndexes = React.useMemo(() => {
    if (points.length <= 1) return points.length ? [0] : []
    const desired = points.length <= 5 ? points.length : 4
    return Array.from({ length: desired }, (_, index) =>
      Math.round((index * (points.length - 1)) / Math.max(1, desired - 1)),
    ).filter((value, index, list) => index === 0 || value !== list[index - 1])
  }, [points.length])

  const yTicks = React.useMemo(() => [0, 0.5, 1].map((ratio) => ({
    ratio,
    y: PAD_TOP + plotHeight - ratio * plotHeight,
    label: Number((safeMax * ratio).toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 }),
  })), [plotHeight, safeMax])

  const handlePointer = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!points.length) return
    const rect = event.currentTarget.getBoundingClientRect()
    const relative = Math.max(0, Math.min(rect.width, event.clientX - rect.left))
    const ratio = rect.width > 0 ? relative / rect.width : 0
    const index = Math.round(ratio * (points.length - 1))
    setActiveIndex(Math.max(0, Math.min(points.length - 1, index)))
  }, [points.length])

  const activePoint = activeIndex == null ? null : points[activeIndex]

  return (
    <Card className="treasury-traffic-card overflow-hidden">
      <CardHeader className="flex flex-col gap-3 space-y-0 border-b pb-4">
        <div className="flex w-full flex-wrap items-center justify-between">
          <CardTitle className="page-section-title">{t("usage.title")}</CardTitle>
          <div className="treasury-chart-total">
            {totalUsedBytes > 0 && <span dir="ltr">{formatBytes(totalUsedBytes)}</span>}
            <small>{displayUnit.label}</small>
          </div>
        </div>
        <div className="ios-segmented-control" role="group" aria-label={t("usage.title")}>
          {timeRangeOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => onTimeRangeChange?.(option.value)}
              aria-pressed={timeRange === option.value}
              className={`ios-segmented-item ${timeRange === option.value ? "is-selected" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="overflow-x-hidden px-2 pt-4 sm:px-6 sm:pt-6">
        {error ? (
          <div className="flex h-[250px] w-full items-center justify-center text-sm text-destructive">
            {error.message || t("common.error")}
          </div>
        ) : points.length ? (
          <div
            className="treasury-lite-chart relative h-[250px] w-full select-none"
            onPointerMove={handlePointer}
            onPointerDown={handlePointer}
            onPointerLeave={() => setActiveIndex(null)}
          >
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="block h-full w-full"
              role="img"
              aria-label={t("usage.title")}
            >
              <defs>
                <linearGradient id="traffic-fill-lite" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--treasury-gold-bright)" stopOpacity="0.42" />
                  <stop offset="42%" stopColor="var(--treasury-emerald-bright)" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="var(--treasury-emerald-bright)" stopOpacity="0.015" />
                </linearGradient>
                <linearGradient id="traffic-stroke-lite" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--treasury-emerald-bright)" />
                  <stop offset="76%" stopColor="var(--treasury-emerald-bright)" />
                  <stop offset="100%" stopColor="var(--treasury-gold-bright)" />
                </linearGradient>
              </defs>

              {yTicks.map((tick) => (
                <g key={tick.ratio}>
                  <line
                    x1={PAD_X}
                    y1={tick.y}
                    x2={CHART_WIDTH - PAD_X}
                    y2={tick.y}
                    stroke="var(--separator)"
                    strokeDasharray="3 5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={PAD_X - 8}
                    y={tick.y + 4}
                    textAnchor="end"
                    fill="var(--muted-foreground)"
                    fontSize="10"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              <path d={areaPath} fill="url(#traffic-fill-lite)" />
              <path
                d={linePath}
                fill="none"
                stroke="url(#traffic-stroke-lite)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />

              {points.length <= 40 && points.map((point, index) => (
                <circle
                  key={point.periodStart}
                  cx={point.x}
                  cy={point.y}
                  r={activeIndex === index ? 5.2 : 2.7}
                  fill="var(--treasury-gold-bright)"
                  stroke="var(--card-solid)"
                  strokeWidth={activeIndex === index ? 3 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
              ))}

              {activePoint && (
                <line
                  x1={activePoint.x}
                  y1={PAD_TOP}
                  x2={activePoint.x}
                  y2={PAD_TOP + plotHeight}
                  stroke="var(--treasury-gold)"
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                />
              )}

              {xLabelIndexes.map((index) => {
                const point = points[index]
                if (!point) return null
                return (
                  <text
                    key={point.periodStart}
                    x={point.x}
                    y={CHART_HEIGHT - 8}
                    textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                    fill="var(--muted-foreground)"
                    fontSize="10"
                  >
                    {formatPeriodLabel(point.periodStart, timeRange, i18n.language)}
                  </text>
                )
              })}
            </svg>

            {activePoint && (
              <div
                className="treasury-lite-tooltip"
                style={{ left: `${(activePoint.x / CHART_WIDTH) * 100}%` }}
                dir={i18n.language === "fa" ? "rtl" : "ltr"}
              >
                <strong dir="ltr">{formatBytes(activePoint.bytes)}</strong>
                <span dir="ltr">{formatTooltipDate(activePoint.periodStart, timeRange, i18n.language)}</span>
              </div>
            )}

            {isLoading && (
              <div className="treasury-chart-loading absolute inset-0 z-10 flex items-center justify-center">
                <span className="text-muted-foreground">{t("common.loading")}</span>
              </div>
            )}
          </div>
        ) : !isLoading ? (
          <div className="flex h-[250px] w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-muted-foreground/40">
              <span className="text-xs">—</span>
            </div>
            <span>{t("usage.noDataInRange")}</span>
          </div>
        ) : (
          <div className="flex h-[250px] w-full items-center justify-center">
            <span className="text-muted-foreground">{t("common.loading")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
})
