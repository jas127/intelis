"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

import {
  INTELIS_ECHARTS_THEME_NAME,
  intelisEChartsTheme,
} from "@/lib/echarts-theme";

let themeRegistered = false;

interface EChartContainerProps {
  option: echarts.EChartsOption;
  className?: string;
}

/**
 * Reusable responsive Apache ECharts container pre-configured with
 * Intelis's light editorial theme. Ready for Phase 2 analytical charts.
 */
export function EChartContainer({
  option,
  className = "h-64 w-full",
}: EChartContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!themeRegistered) {
      echarts.registerTheme(INTELIS_ECHARTS_THEME_NAME, intelisEChartsTheme);
      themeRegistered = true;
    }

    const chart = echarts.init(
      containerRef.current,
      INTELIS_ECHARTS_THEME_NAME
    );
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={containerRef} className={className} />;
}
