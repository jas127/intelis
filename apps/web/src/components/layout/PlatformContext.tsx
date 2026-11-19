"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_HYDERABAD_VIEWPORT,
  fetchHealth,
  fetchMetadata,
  type CategoryMetadata,
  type CityMetadata,
  type HealthResponse,
  type MetadataResponse,
} from "@/lib/api";

export type ConnectionState = "checking" | "connected" | "offline";

interface PlatformContextValue {
  connectionState: ConnectionState;
  health: HealthResponse | null;
  metadata: MetadataResponse | null;
  selectedCitySlug: string;
  selectedCategorySlug: string;
  selectedCity: CityMetadata;
  selectedCategory: CategoryMetadata;
  setSelectedCitySlug: (slug: string) => void;
  setSelectedCategorySlug: (slug: string) => void;
  refreshConnection: () => void;
  errorMessage: string | null;
}

const FALLBACK_CITY: CityMetadata = {
  slug: "hyderabad",
  name: "Hyderabad",
  state: "Telangana",
  country: "India",
  status: "active",
  viewport: DEFAULT_HYDERABAD_VIEWPORT,
  data_status: "awaiting_ingestion",
};

const FALLBACK_CATEGORY: CategoryMetadata = {
  slug: "cafes-coffee-shops",
  name: "Cafes & Coffee Shops",
  description:
    "Specialty coffee roasters, neighbourhood cafes, and quick-service coffee outlets evaluated across urban localities.",
  status: "active",
  accent: "cobalt",
};

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [metadata, setMetadata] = useState<MetadataResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedCitySlug, setSelectedCitySlug] = useState<string>("hyderabad");
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>(
    "cafes-coffee-shops"
  );

  const loadBackendState = useCallback(() => {
    const controller = new AbortController();
    setConnectionState("checking");
    setErrorMessage(null);

    Promise.all([
      fetchHealth(controller.signal),
      fetchMetadata(controller.signal),
    ])
      .then(([healthData, metadataData]) => {
        setHealth(healthData);
        setMetadata(metadataData);
        setSelectedCitySlug(metadataData.default_city);
        setSelectedCategorySlug(metadataData.default_category);
        setConnectionState("connected");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setConnectionState("offline");
        setErrorMessage(
          err instanceof Error ? err.message : "Backend service unreachable"
        );
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    return loadBackendState();
  }, [loadBackendState]);

  const selectedCity = useMemo(() => {
    return (
      metadata?.cities.find((c) => c.slug === selectedCitySlug) ?? FALLBACK_CITY
    );
  }, [metadata, selectedCitySlug]);

  const selectedCategory = useMemo(() => {
    return (
      metadata?.categories.find((c) => c.slug === selectedCategorySlug) ??
      FALLBACK_CATEGORY
    );
  }, [metadata, selectedCategorySlug]);

  const value = useMemo<PlatformContextValue>(
    () => ({
      connectionState,
      health,
      metadata,
      selectedCitySlug,
      selectedCategorySlug,
      selectedCity,
      selectedCategory,
      setSelectedCitySlug,
      setSelectedCategorySlug,
      refreshConnection: loadBackendState,
      errorMessage,
    }),
    [
      connectionState,
      health,
      metadata,
      selectedCitySlug,
      selectedCategorySlug,
      selectedCity,
      selectedCategory,
      loadBackendState,
      errorMessage,
    ]
  );

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error("usePlatform must be used within a PlatformProvider");
  }
  return ctx;
}
