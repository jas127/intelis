from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.zones import BoundaryVintageMetadata, ZoneMetrics


class ScoringWeights(BaseModel):
    competition_whitespace: float = Field(default=40.0, ge=0.0, le=100.0)
    food_context: float = Field(default=35.0, ge=0.0, le=100.0)
    data_reliability: float = Field(default=25.0, ge=0.0, le=100.0)


class OpportunityScoreBreakdown(BaseModel):
    h3_index: str
    rank: int | None = None
    is_eligible: bool
    exclusion_reason: str | None = None
    zero_observed_cafes: bool
    competition_whitespace_score: float | None = None
    food_context_score: float | None = None
    data_reliability_score: float | None = None
    exploration_score: float | None = None
    explanation: str
    metrics: ZoneMetrics


class OpportunitiesListResponse(BaseModel):
    city: str
    score_label: Literal["Exploratory Market Screening Score"] = (
        "Exploratory Market Screening Score"
    )
    disclaimer: str
    weights: ScoringWeights
    min_places_filter: int
    min_completeness_pct: float
    total_cells: int
    eligible_cells: int
    excluded_cells: int
    returned: int
    candidates: list[OpportunityScoreBreakdown]
    boundary_metadata: BoundaryVintageMetadata


class OpportunityDetailResponse(BaseModel):
    city: str
    score_label: Literal["Exploratory Market Screening Score"] = (
        "Exploratory Market Screening Score"
    )
    disclaimer: str
    weights: ScoringWeights
    eligible_cells: int
    candidate: OpportunityScoreBreakdown
    boundary_metadata: BoundaryVintageMetadata


class SensitivityCandidateRow(BaseModel):
    h3_index: str
    dominant_postcode: str | None = None
    dominant_locality: str | None = None
    cafe_count: int
    food_business_count: int
    default_rank: int
    default_score: float
    equal_rank: int
    equal_score: float
    custom_rank: int
    custom_score: float
    max_rank_shift: int
    remains_in_top_10_all_profiles: bool


class SensitivityResponse(BaseModel):
    city: str
    score_label: Literal["Exploratory Market Screening Score"] = (
        "Exploratory Market Screening Score"
    )
    disclaimer: str
    default_weights: ScoringWeights
    equal_weights: ScoringWeights
    custom_weights: ScoringWeights
    eligible_cells: int
    top_10_overlap_default_vs_equal: int
    top_10_overlap_default_vs_custom: int
    stable_in_all_three_top_10: int
    candidates: list[SensitivityCandidateRow]
