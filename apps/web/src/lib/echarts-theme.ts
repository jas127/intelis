/**
 * Shared Apache ECharts light theme matching docs/design-system.md.
 * Registered once by EChartContainer for consistent analytical visualisations.
 */
export const INTELIS_ECHARTS_THEME_NAME = "intelis-light";

export const intelisEChartsTheme = {
  color: ["#1e4fd8", "#eb5e47", "#1b9a6b", "#7e6df2", "#f28c28"],
  backgroundColor: "transparent",
  textStyle: {
    color: "#181a1f",
    fontFamily: "var(--font-sans), system-ui, sans-serif",
  },
  title: {
    textStyle: {
      color: "#181a1f",
      fontWeight: 600,
    },
    subtextStyle: {
      color: "#555b66",
    },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: "#e6e0d6" } },
    axisTick: { show: false },
    axisLabel: { color: "#555b66" },
    splitLine: { show: false },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: "#555b66" },
    splitLine: { lineStyle: { color: "#e6e0d6", type: "dashed" } },
  },
  tooltip: {
    backgroundColor: "#ffffff",
    borderColor: "#e6e0d6",
    borderWidth: 1,
    textStyle: {
      color: "#181a1f",
      fontSize: 12,
    },
  },
};
