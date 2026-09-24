"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { useTranslation } from "react-i18next"
import type { TooltipProps } from "recharts"
import { dateUtils } from "@/lib/dateFormatter"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"

const chartConfig = {
  traffic: {
    label: "Traffic",
    color: "var(--primary)",
  },
} satisfies ChartConfig

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B"

  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))

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

interface FormattedDataPoint {
  date: string
  traffic: number
  displayTraffic: number
  _bytes: number
  _period_start: string
}

interface CustomTrafficTooltipProps extends TooltipProps<number, string> {
  timeRange: string
}

const CustomTrafficTooltip = React.memo(function CustomTrafficTooltip({
  active,
  payload,
  timeRange,
}: CustomTrafficTooltipProps) {
  const { t, i18n } = useTranslation()

  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload as FormattedDataPoint

  // Format date using dateUtils
  const d = dateUtils.toDayjs(data._period_start)
  let formattedDate: string
  const isShortRange = timeRange === "1h" || timeRange === "12h" || timeRange === "24h"

  try {
    if (i18n.language === 'fa') {
      formattedDate = isShortRange
        ? d
          .toDate()
          .toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : d
          .toDate()
          .toLocaleDateString('fa-IR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
    } else if (isShortRange) {
      formattedDate = d
        .format('YYYY/MM/DD HH:mm')
    } else {
      formattedDate = d.format('YYYY/MM/DD')
    }
  } catch {
    formattedDate = isShortRange ? d.format('YYYY/MM/DD HH:mm') : d.format('YYYY/MM/DD')
  }

  const isRTL = i18n.language === 'fa'

  return (
    <div
      className={`min-w-[150px] rounded-xl border border-border bg-popover/95 p-3 text-sm shadow-xl backdrop-blur-xl ${isRTL ? 'text-right' : 'text-left'}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className={`mb-2 text-sm font-semibold text-muted-foreground ${isRTL ? 'text-right' : 'text-left'}`}>
        <span dir="ltr" className="inline-block">
          {formattedDate}
        </span>
      </div>
      <div className={`text-base font-bold text-foreground ${isRTL ? 'text-right' : 'text-left'}`}>
        <span>{t('usage.totalUsage')}: </span>
        <span dir="ltr" className="inline-block font-mono">
          {formatBytes(data._bytes)}
        </span>
      </div>
    </div>
  )
})

export const TrafficChart = React.memo(function TrafficChart({
  data,
  isLoading = false,
  error,
  timeRange = "7d",
  onTimeRangeChange
}: TrafficChartProps) {
  const { t, i18n } = useTranslation()

  const displayUnit = React.useMemo(() => {
    const maxBytes = (data ?? []).reduce((max, point) => Math.max(max, point.total_traffic), 0)
    return getDisplayUnit(maxBytes)
  }, [data])

  const filteredData = React.useMemo(() => {
    if (!data || data.length === 0) return []

    return data.map((point) => ({
      date: point.period_start,
      traffic: point.total_traffic / displayUnit.divisor,
      displayTraffic: Number((point.total_traffic / displayUnit.divisor).toFixed(3)),
      _bytes: point.total_traffic,
      _period_start: point.period_start,
    }))
  }, [data, displayUnit])
  const hasChartPoints = filteredData.length > 0
  const totalUsedBytes = React.useMemo(
    () => data?.reduce((sum, point) => sum + point.total_traffic, 0) ?? 0,
    [data]
  )

  const timeRangeOptions = React.useMemo(() => ([
    { value: '24h', label: t('timeRange.24h') || '24h' },
    { value: '7d', label: t('timeRange.7d') || '7d' },
    { value: '30d', label: t('timeRange.30d') || '30d' },
  ]), [t])

  return (
    <Card className="treasury-traffic-card overflow-hidden">
      <CardHeader className="flex flex-col gap-3 space-y-0 border-b pb-4">
        <div className="flex flex-wrap items-center justify-between w-full">
          <CardTitle className="page-section-title">{t('usage.title')}</CardTitle>
          <div className="treasury-chart-total">
            {totalUsedBytes > 0 && (
              <span dir="ltr">
                {formatBytes(totalUsedBytes)}
              </span>
            )}
            <small>{displayUnit.label}</small>
          </div>
        </div>
        <div className="ios-segmented-control" role="group" aria-label={t('usage.title')}>
          {timeRangeOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => onTimeRangeChange?.(option.value)}
              aria-pressed={timeRange === option.value}
              className={`ios-segmented-item ${timeRange === option.value ? 'is-selected' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6 overflow-x-hidden">
        {error ? (
          <div className="h-[250px] w-full flex items-center justify-center text-destructive text-sm">
            {error.message || t('common.error')}
          </div>
        ) : (
          <div className="relative h-[250px] w-full">
            {/* Chart Container - Always rendered to maintain DOM structure */}
            <ChartContainer
              config={chartConfig}
              className="aspect-auto h-[250px] w-full max-w-full"
            >
              {hasChartPoints ? (
                <AreaChart
                  data={filteredData}
                  margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillTraffic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--treasury-gold-bright)" stopOpacity={0.52} />
                      <stop offset="34%" stopColor="var(--treasury-emerald-bright)" stopOpacity={0.34} />
                      <stop offset="100%" stopColor="var(--treasury-emerald-bright)" stopOpacity={0.025} />
                    </linearGradient>
                    <linearGradient id="strokeTraffic" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="var(--treasury-emerald-bright)" />
                      <stop offset="78%" stopColor="var(--treasury-emerald-bright)" />
                      <stop offset="100%" stopColor="var(--treasury-gold-bright)" />
                    </linearGradient>
                    <filter id="trafficGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--separator)" strokeDasharray="2 4" />
                  <YAxis
                    width={42}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 'auto']}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                    tickFormatter={(value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={16}
                    tick={{
                      fill: 'var(--muted-foreground)',
                      fontSize: 11
                    }}
                    tickFormatter={(value) => {
                      const d = dateUtils.toDayjs(value)
                      // For short ranges, show time
                      if (timeRange === "1h" || timeRange === "12h" || timeRange === "24h") {
                        if (i18n.language === 'fa') {
                          return d.toDate().toLocaleTimeString('fa-IR', {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false
                          })
                        }
                        return d.format('HH:mm')
                      }
                      // For days, show date
                      if (i18n.language === 'fa') {
                        return d.toDate().toLocaleDateString('fa-IR', {
                          month: "short",
                          day: "numeric",
                        })
                      }
                      return d.format('MMM D')
                    }}
                  />
                  <ChartTooltip
                    cursor={{ stroke: 'var(--treasury-gold)', strokeWidth: 1, strokeDasharray: '3 4' }}
                    content={<CustomTrafficTooltip timeRange={timeRange} />}
                  />
                  <Area
                    dataKey="displayTraffic"
                    type="monotone"
                    fill="url(#fillTraffic)"
                    stroke="url(#strokeTraffic)"
                    strokeWidth={3}
                    filter="url(#trafficGlow)"
                    dot={filteredData.length <= 40 ? { r: 3.5, fill: 'var(--treasury-gold-bright)', stroke: 'var(--treasury-emerald)', strokeWidth: 2 } : false}
                    activeDot={{ r: 6, fill: 'var(--treasury-gold-bright)', stroke: 'var(--card-solid)', strokeWidth: 3 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </AreaChart>
              ) : !isLoading ? (
                <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
                  <div className="w-10 h-10 rounded-full border border-dashed border-muted-foreground/40 flex items-center justify-center">
                    <span className="text-xs">—</span>
                  </div>
                  <span>
                    {t('usage.noDataInRange')}
                  </span>
                </div>
              ) : (
                <div className="h-full w-full" />
              )}
            </ChartContainer>

            {/* Loading Overlay - Only shown when loading */}
            {isLoading && (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
                <span className="text-muted-foreground">
                  {t('common.loading')}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
})
