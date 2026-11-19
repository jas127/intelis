export interface HealthResponse {
  status: "ok" | "degraded";
  service: string;
  version: string;
  environment: string;
  datasets_ready: boolean;
  missing_datasets: string[];
  timestamp: string;
}

export interface MapViewport {
  center: [number, number];
  zoom: number;
  bbox: [number, number, number, number];
}

export interface CityMetadata {
  slug: string;
  name: string;
  state: string;
  country: string;
  status: "active" | "planned";
  viewport: MapViewport;
  data_status: "awaiting_ingestion" | "ready";
}

export interface CategoryMetadata {
  slug: string;
  name: string;
  description: string;
  status: "active" | "planned";
  accent: "cobalt" | "coral" | "orange" | "lavender" | "green";
}

export interface MetadataResponse {
  product: string;
  tagline: string;
  default_city: string;
  default_category: string;
  cities: CityMetadata[];
  categories: CategoryMetadata[];
}

export interface POIProperties {
  overture_id: string;
  primary_name: string | null;
  basic_category: string | null;
  taxonomy_primary: string | null;
  confidence: number | null;
  address: string | null;
  locality: string | null;
  postcode: string | null;
  website: string | null;
  phone: string | null;
  operating_status: string | null;
  classification_disagreement: boolean;
  classification_disagreement_note: string | null;
}

export interface POIFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: POIProperties;
}

export interface POICollectionMeta {
  city: string;
  category: string;
  total_matching: number;
  returned: number;
  limit: number;
  offset: number;
  bbox: [number, number, number, number] | null;
}

export interface POIFeatureCollection {
  type: "FeatureCollection";
  features: POIFeature[];
  metadata: POICollectionMeta;
}

export interface CategoryBreakdownItem {
  category: string;
  count: number;
  share_pct: number;
}

export interface DataCoverageMetadata {
  source_provider: string;
  crs: string;
  processed_at_utc: string | null;
  missing_category_count: number;
  cafe_classification_disagreements: number;
  geographic_extent: Record<string, number>;
}

export interface CitySummaryResponse {
  city: string;
  total_places: number;
  cafes_coffee_shops_count: number;
  restaurant_count: number;
  food_business_count: number;
  category_breakdown: CategoryBreakdownItem[];
  food_category_breakdown: CategoryBreakdownItem[];
  data_coverage: DataCoverageMetadata;
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

export const DEFAULT_HYDERABAD_VIEWPORT: MapViewport = {
  center: [78.4867, 17.385],
  zoom: 11.4,
  bbox: [78.2002, 17.2, 78.7, 17.6],
};

async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    let detail = `API request failed (${response.status})`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore non-JSON error body
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return fetchJson<HealthResponse>("/api/v1/health", signal);
}

export function fetchMetadata(signal?: AbortSignal): Promise<MetadataResponse> {
  return fetchJson<MetadataResponse>("/api/v1/metadata", signal);
}

export function fetchHyderabadSummary(
  signal?: AbortSignal
): Promise<CitySummaryResponse> {
  return fetchJson<CitySummaryResponse>("/api/v1/cities/hyderabad/summary", signal);
}

export interface FetchPOIsParams {
  category?: string;
  bbox?: [number, number, number, number] | null;
  limit?: number;
  offset?: number;
  excludeDisagreements?: boolean;
}

export function fetchHyderabadPOIs(
  params: FetchPOIsParams = {},
  signal?: AbortSignal
): Promise<POIFeatureCollection> {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.bbox) {
    query.set(
      "bbox",
      params.bbox.map((v) => v.toFixed(5)).join(",")
    );
  }
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.offset !== undefined) query.set("offset", String(params.offset));
  if (params.excludeDisagreements) {
    query.set("exclude_disagreements", "true");
  }

  const qs = query.toString();
  return fetchJson<POIFeatureCollection>(
    `/api/v1/cities/hyderabad/pois${qs ? `?${qs}` : ""}`,
    signal
  );
}

export type ChoroplethMetricKey =
  | "exploration_score"
  | "cafe_density_per_km2"
  | "cafe_count"
  | "food_density_per_km2"
  | "restaurant_count";

export interface BoundaryVintageMetadata {
  source_file: string;
  osm_id: string | null;
  osm_timestamp: string | null;
  vintage_warning: string;
  h3_resolution: number;
  projected_crs: string;
  min_reliable_area_km2: number;
}

export interface ZoneMetrics {
  h3_index: string;
  resolution: number;
  centroid_lon: number;
  centroid_lat: number;
  dominant_postcode: string | null;
  dominant_locality?: string | null;
  full_area_km2: number;
  clipped_area_km2: number;
  area_coverage_pct: number;
  low_area_flag: boolean;
  total_places_count: number;
  cafe_count: number;
  restaurant_count: number;
  food_business_count: number;
  cafe_density_per_km2: number | null;
  food_density_per_km2: number | null;
  median_nearest_cafe_distance_m: number | null;
  median_confidence: number | null;
  high_confidence_count: number;
  high_confidence_pct: number | null;
  data_completeness_pct: number | null;
  cafe_disagreement_count: number;
  exploration_score?: number | null;
  competition_whitespace_score?: number | null;
  food_context_score?: number | null;
  data_reliability_score?: number | null;
}

export interface ZoneGeoJSONFeature {
  type: "Feature";
  id: string;
  geometry: GeoJSON.Geometry;
  properties: ZoneMetrics;
}

export interface ZonesFeatureCollection {
  type: "FeatureCollection";
  features: ZoneGeoJSONFeature[];
  metadata: {
    city: string;
    category: string;
    metric: string;
    total_matching: number;
    returned: number;
    limit: number;
    bbox: [number, number, number, number] | null;
    boundary_metadata: BoundaryVintageMetadata;
  };
}

export interface ZoneBusinessItem extends POIProperties {
  longitude: number;
  latitude: number;
  is_food_business: boolean;
  is_cafe_or_coffee_shop: boolean;
  nearest_cafe_distance_m: number | null;
}

export interface ZoneDetailResponse {
  city: string;
  zone: ZoneMetrics;
  cafes: ZoneBusinessItem[];
  other_food_businesses_count: number;
  boundary_metadata: BoundaryVintageMetadata;
}

export interface CompareBenchmarks {
  reliable_cells_count: number;
  median_cafe_density_per_km2: number | null;
  median_food_density_per_km2: number | null;
  median_nearest_cafe_distance_m: number | null;
}

export interface ZonesCompareResponse {
  city: string;
  zones: ZoneMetrics[];
  benchmarks: CompareBenchmarks;
  warnings: string[];
  boundary_metadata: BoundaryVintageMetadata;
}

export function fetchHyderabadZones(
  params: {
    category?: string;
    metric?: ChoroplethMetricKey;
    limit?: number;
  } = {},
  signal?: AbortSignal
): Promise<ZonesFeatureCollection> {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.metric) query.set("metric", params.metric);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const qs = query.toString();
  return fetchJson<ZonesFeatureCollection>(
    `/api/v1/cities/hyderabad/zones${qs ? `?${qs}` : ""}`,
    signal
  );
}

export function fetchHyderabadZoneDetail(
  h3Index: string,
  signal?: AbortSignal
): Promise<ZoneDetailResponse> {
  return fetchJson<ZoneDetailResponse>(
    `/api/v1/cities/hyderabad/zones/${encodeURIComponent(h3Index)}`,
    signal
  );
}

export function fetchHyderabadCompare(
  zoneIds: string[],
  signal?: AbortSignal
): Promise<ZonesCompareResponse> {
  const query = new URLSearchParams({ zone_ids: zoneIds.join(",") });
  return fetchJson<ZonesCompareResponse>(
    `/api/v1/cities/hyderabad/compare?${query.toString()}`,
    signal
  );
}

export interface ScoringWeights {
  competition_whitespace: number;
  food_context: number;
  data_reliability: number;
}

export interface OpportunityScoreBreakdown {
  h3_index: string;
  rank: number | null;
  is_eligible: boolean;
  exclusion_reason: string | null;
  zero_observed_cafes: boolean;
  competition_whitespace_score: number | null;
  food_context_score: number | null;
  data_reliability_score: number | null;
  exploration_score: number | null;
  explanation: string;
  metrics: ZoneMetrics;
}

export interface OpportunitiesListResponse {
  city: string;
  score_label: "Exploratory Market Screening Score";
  disclaimer: string;
  weights: ScoringWeights;
  min_places_filter: number;
  min_completeness_pct: number;
  total_cells: number;
  eligible_cells: number;
  excluded_cells: number;
  returned: number;
  candidates: OpportunityScoreBreakdown[];
  boundary_metadata: BoundaryVintageMetadata;
}

export interface OpportunityDetailResponse {
  city: string;
  score_label: "Exploratory Market Screening Score";
  disclaimer: string;
  weights: ScoringWeights;
  eligible_cells: number;
  candidate: OpportunityScoreBreakdown;
  boundary_metadata: BoundaryVintageMetadata;
}

export interface SensitivityCandidateRow {
  h3_index: string;
  dominant_postcode: string | null;
  dominant_locality?: string | null;
  cafe_count: number;
  food_business_count: number;
  default_rank: number;
  default_score: number;
  equal_rank: number;
  equal_score: number;
  custom_rank: number;
  custom_score: number;
  max_rank_shift: number;
  remains_in_top_10_all_profiles: boolean;
}

export interface SensitivityResponse {
  city: string;
  score_label: "Exploratory Market Screening Score";
  disclaimer: string;
  default_weights: ScoringWeights;
  equal_weights: ScoringWeights;
  custom_weights: ScoringWeights;
  eligible_cells: number;
  top_10_overlap_default_vs_equal: number;
  top_10_overlap_default_vs_custom: number;
  stable_in_all_three_top_10: number;
  candidates: SensitivityCandidateRow[];
}

export function fetchHyderabadOpportunities(
  params: {
    wCompetition?: number;
    wFoodContext?: number;
    wReliability?: number;
    minPlaces?: number;
    minCompletenessPct?: number;
    limit?: number;
    sortBy?: string;
  } = {},
  signal?: AbortSignal
): Promise<OpportunitiesListResponse> {
  const query = new URLSearchParams();
  if (params.wCompetition !== undefined)
    query.set("w_competition", String(params.wCompetition));
  if (params.wFoodContext !== undefined)
    query.set("w_food_context", String(params.wFoodContext));
  if (params.wReliability !== undefined)
    query.set("w_reliability", String(params.wReliability));
  if (params.minPlaces !== undefined)
    query.set("min_places", String(params.minPlaces));
  if (params.minCompletenessPct !== undefined)
    query.set("min_completeness_pct", String(params.minCompletenessPct));
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.sortBy) query.set("sort_by", params.sortBy);
  const qs = query.toString();
  return fetchJson<OpportunitiesListResponse>(
    `/api/v1/cities/hyderabad/opportunities${qs ? `?${qs}` : ""}`,
    signal
  );
}

export function fetchHyderabadOpportunityDetail(
  h3Index: string,
  weights?: ScoringWeights,
  signal?: AbortSignal
): Promise<OpportunityDetailResponse> {
  const query = new URLSearchParams();
  if (weights) {
    query.set("w_competition", String(weights.competition_whitespace));
    query.set("w_food_context", String(weights.food_context));
    query.set("w_reliability", String(weights.data_reliability));
  }
  const qs = query.toString();
  return fetchJson<OpportunityDetailResponse>(
    `/api/v1/cities/hyderabad/opportunities/${encodeURIComponent(h3Index)}${qs ? `?${qs}` : ""}`,
    signal
  );
}

export function fetchHyderabadSensitivity(
  params: {
    wCompetition?: number;
    wFoodContext?: number;
    wReliability?: number;
    minPlaces?: number;
    minCompletenessPct?: number;
  } = {},
  signal?: AbortSignal
): Promise<SensitivityResponse> {
  const query = new URLSearchParams();
  if (params.wCompetition !== undefined)
    query.set("w_competition", String(params.wCompetition));
  if (params.wFoodContext !== undefined)
    query.set("w_food_context", String(params.wFoodContext));
  if (params.wReliability !== undefined)
    query.set("w_reliability", String(params.wReliability));
  if (params.minPlaces !== undefined)
    query.set("min_places", String(params.minPlaces));
  if (params.minCompletenessPct !== undefined)
    query.set("min_completeness_pct", String(params.minCompletenessPct));
  const qs = query.toString();
  return fetchJson<SensitivityResponse>(
    `/api/v1/cities/hyderabad/opportunities/sensitivity${qs ? `?${qs}` : ""}`,
    signal
  );
}
