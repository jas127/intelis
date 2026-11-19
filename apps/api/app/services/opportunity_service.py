from __future__ import annotations

import duckdb

from app.schemas.opportunities import (
    OpportunitiesListResponse,
    OpportunityDetailResponse,
    OpportunityScoreBreakdown,
    ScoringWeights,
    SensitivityCandidateRow,
    SensitivityResponse,
)
from app.services.h3_zones_service import (
    _load_boundary_metadata,
    _load_dominant_localities,
    _require_processed,
    _row_to_zone_metrics,
)

DEFAULT_WEIGHTS = ScoringWeights(
    competition_whitespace=40.0,
    food_context=35.0,
    data_reliability=25.0,
)

EQUAL_WEIGHTS = ScoringWeights(
    competition_whitespace=33.33,
    food_context=33.33,
    data_reliability=33.34,
)

EXPLORATORY_DISCLAIMER = (
    "Exploratory Market Screening Score based strictly on observed Overture Places "
    "supply and data quality indicators. It is NOT a measure of consumer demand, "
    "footfall, expected revenue, profitability, or commercial viability."
)

ALLOWED_SORT_FIELDS = {
    "exploration_score",
    "competition_whitespace_score",
    "food_context_score",
    "data_reliability_score",
    "cafe_density_per_km2",
    "food_density_per_km2",
    "cafe_count",
}


def validate_weights(
    w_competition: float, w_food_context: float, w_reliability: float
) -> ScoringWeights:
    for name, val in (
        ("w_competition", w_competition),
        ("w_food_context", w_food_context),
        ("w_reliability", w_reliability),
    ):
        if val < 0.0 or val > 100.0:
            raise ValueError(f"{name} must be between 0 and 100.")
    total = w_competition + w_food_context + w_reliability
    if abs(total - 100.0) > 0.05:
        raise ValueError(
            f"Component weights must sum to 100% (received {total:.2f}%)."
        )
    return ScoringWeights(
        competition_whitespace=round(w_competition, 2),
        food_context=round(w_food_context, 2),
        data_reliability=round(w_reliability, 2),
    )


def _average_percentile_ranks(values: list[float]) -> list[float]:
    """Compute 0–100 average-rank percentiles so ties receive identical scores."""
    n = len(values)
    if n == 0:
        return []
    if n == 1:
        return [50.0]

    indexed = sorted(enumerate(values), key=lambda kv: kv[1])
    ranks = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and indexed[j + 1][1] == indexed[i][1]:
            j += 1
        avg_rank = 0.5 * (i + j)  # 0-based average rank in [0, n-1]
        pct = 100.0 * avg_rank / (n - 1)
        for k in range(i, j + 1):
            ranks[indexed[k][0]] = round(pct, 2)
        i = j + 1
    return ranks


def _load_all_metrics():
    metrics_path = _require_processed("hyderabad_h3_metrics.parquet")
    m_src = str(metrics_path).replace("'", "''")
    con = duckdb.connect()
    try:
        rel = con.execute(f"SELECT * FROM read_parquet('{m_src}') ORDER BY h3_index ASC")
        cols = [d[0] for d in rel.description]
        rows = rel.fetchall()
    finally:
        con.close()
    localities = _load_dominant_localities()
    return [_row_to_zone_metrics(dict(zip(cols, r)), localities) for r in rows]


def _build_explanation(
    *,
    is_eligible: bool,
    exclusion_reason: str | None,
    cafe_count: int,
    cafe_density: float | None,
    food_count: int,
    food_density: float | None,
    median_conf: float | None,
    completeness: float | None,
    clipped_area: float,
    coverage_pct: float,
    cw_score: float | None,
    fc_score: float | None,
    dr_score: float | None,
) -> str:
    if not is_eligible:
        return f"Excluded from screening: {exclusion_reason}."

    cafe_part = (
        "0 observed cafes (highest competition whitespace tier)"
        if cafe_count == 0
        else f"{cafe_count} observed cafe(s) ({cafe_density:.1f}/km², whitespace {cw_score:.0f}/100)"
    )
    food_part = (
        f"{food_count} food businesses ({food_density:.1f}/km², context {fc_score:.0f}/100)"
    )
    qual_part = (
        f"reliability {dr_score:.0f}/100 "
        f"(median confidence {median_conf * 100:.0f}%, completeness {completeness:.0f}%)"
    )
    area_part = f"{clipped_area:.3f} km² ({coverage_pct:.0f}% hex coverage)"
    return f"{cafe_part}; {food_part}; {qual_part}; {area_part}."


def compute_all_opportunity_scores(
    *,
    weights: ScoringWeights = DEFAULT_WEIGHTS,
    min_places: int = 5,
    min_completeness_pct: float = 0.0,
) -> tuple[list[OpportunityScoreBreakdown], int, int]:
    """Score all eligible H3 cells deterministically and return (all_rows, eligible_count, excluded_count)."""
    all_metrics = _load_all_metrics()

    eligible_indices: list[int] = []
    exclusion_reasons: dict[int, str] = {}

    for idx, m in enumerate(all_metrics):
        if m.low_area_flag or m.cafe_density_per_km2 is None or m.food_density_per_km2 is None:
            exclusion_reasons[idx] = "Low-area boundary sliver (< 0.15 km²)"
        elif m.total_places_count < min_places:
            exclusion_reasons[idx] = f"Insufficient Overture records (< {min_places} places)"
        elif (
            m.median_confidence is None
            or m.high_confidence_pct is None
            or m.data_completeness_pct is None
        ):
            exclusion_reasons[idx] = "Missing required confidence or completeness metrics"
        elif m.data_completeness_pct < min_completeness_pct:
            exclusion_reasons[idx] = (
                f"Below minimum data completeness filter (< {min_completeness_pct:.0f}%)"
            )
        else:
            eligible_indices.append(idx)

    # Compute percentile dimensions strictly across eligible cells
    neg_cafe_dens = [-float(all_metrics[i].cafe_density_per_km2) for i in eligible_indices]
    food_dens = [float(all_metrics[i].food_density_per_km2) for i in eligible_indices]
    med_conf = [float(all_metrics[i].median_confidence) for i in eligible_indices]
    high_conf = [float(all_metrics[i].high_confidence_pct) for i in eligible_indices]
    completeness = [float(all_metrics[i].data_completeness_pct) for i in eligible_indices]

    cw_pcts = _average_percentile_ranks(neg_cafe_dens)
    fc_pcts = _average_percentile_ranks(food_dens)
    mc_pcts = _average_percentile_ranks(med_conf)
    hc_pcts = _average_percentile_ranks(high_conf)
    dc_pcts = _average_percentile_ranks(completeness)

    w_cw = weights.competition_whitespace / 100.0
    w_fc = weights.food_context / 100.0
    w_dr = weights.data_reliability / 100.0

    scored_map: dict[int, tuple[float, float, float, float]] = {}
    for pos, idx in enumerate(eligible_indices):
        cw = cw_pcts[pos]
        fc = fc_pcts[pos]
        dr = round((mc_pcts[pos] + hc_pcts[pos] + dc_pcts[pos]) / 3.0, 2)
        comp = round(w_cw * cw + w_fc * fc + w_dr * dr, 2)
        scored_map[idx] = (cw, fc, dr, comp)

    # Deterministic ranking among eligible cells
    ranked_eligible = sorted(
        eligible_indices,
        key=lambda i: (
            -scored_map[i][3],
            -float(all_metrics[i].food_density_per_km2 or 0.0),
            float(all_metrics[i].cafe_density_per_km2 or 0.0),
            all_metrics[i].h3_index,
        ),
    )
    rank_by_idx = {idx: rank + 1 for rank, idx in enumerate(ranked_eligible)}

    results: list[OpportunityScoreBreakdown] = []
    for idx, m in enumerate(all_metrics):
        is_elig = idx in scored_map
        reason = exclusion_reasons.get(idx)
        cw = scored_map[idx][0] if is_elig else None
        fc = scored_map[idx][1] if is_elig else None
        dr = scored_map[idx][2] if is_elig else None
        comp = scored_map[idx][3] if is_elig else None

        results.append(
            OpportunityScoreBreakdown(
                h3_index=m.h3_index,
                rank=rank_by_idx.get(idx),
                is_eligible=is_elig,
                exclusion_reason=reason,
                zero_observed_cafes=m.cafe_count == 0,
                competition_whitespace_score=cw,
                food_context_score=fc,
                data_reliability_score=dr,
                exploration_score=comp,
                explanation=_build_explanation(
                    is_eligible=is_elig,
                    exclusion_reason=reason,
                    cafe_count=m.cafe_count,
                    cafe_density=m.cafe_density_per_km2,
                    food_count=m.food_business_count,
                    food_density=m.food_density_per_km2,
                    median_conf=m.median_confidence,
                    completeness=m.data_completeness_pct,
                    clipped_area=m.clipped_area_km2,
                    coverage_pct=m.area_coverage_pct,
                    cw_score=cw,
                    fc_score=fc,
                    dr_score=dr,
                ),
                metrics=m,
            )
        )

    return results, len(eligible_indices), len(all_metrics) - len(eligible_indices)


def get_hyderabad_opportunities(
    *,
    weights: ScoringWeights = DEFAULT_WEIGHTS,
    min_places: int = 5,
    min_completeness_pct: float = 0.0,
    limit: int = 10,
    sort_by: str = "exploration_score",
    include_ineligible: bool = False,
) -> OpportunitiesListResponse:
    if sort_by not in ALLOWED_SORT_FIELDS:
        raise ValueError(
            f"Unsupported sort_by '{sort_by}'. Allowed: {sorted(ALLOWED_SORT_FIELDS)}"
        )

    all_rows, eligible_count, excluded_count = compute_all_opportunity_scores(
        weights=weights,
        min_places=min_places,
        min_completeness_pct=min_completeness_pct,
    )

    pool = all_rows if include_ineligible else [r for r in all_rows if r.is_eligible]

    def _sort_key(row: OpportunityScoreBreakdown):
        if sort_by in (
            "exploration_score",
            "competition_whitespace_score",
            "food_context_score",
            "data_reliability_score",
        ):
            val = getattr(row, sort_by)
        else:
            val = getattr(row.metrics, sort_by)
        return (val is not None, float(val) if val is not None else -1.0, -(row.rank or 999999))

    pool.sort(key=_sort_key, reverse=True)
    sliced = pool[:limit]

    return OpportunitiesListResponse(
        city="hyderabad",
        disclaimer=EXPLORATORY_DISCLAIMER,
        weights=weights,
        min_places_filter=min_places,
        min_completeness_pct=min_completeness_pct,
        total_cells=len(all_rows),
        eligible_cells=eligible_count,
        excluded_cells=excluded_count,
        returned=len(sliced),
        candidates=sliced,
        boundary_metadata=_load_boundary_metadata(),
    )


def get_hyderabad_opportunity_detail(
    h3_index: str,
    *,
    weights: ScoringWeights = DEFAULT_WEIGHTS,
    min_places: int = 5,
    min_completeness_pct: float = 0.0,
) -> OpportunityDetailResponse | None:
    all_rows, eligible_count, _ = compute_all_opportunity_scores(
        weights=weights,
        min_places=min_places,
        min_completeness_pct=min_completeness_pct,
    )
    match = next((r for r in all_rows if r.h3_index == h3_index), None)
    if match is None:
        return None

    return OpportunityDetailResponse(
        city="hyderabad",
        disclaimer=EXPLORATORY_DISCLAIMER,
        weights=weights,
        eligible_cells=eligible_count,
        candidate=match,
        boundary_metadata=_load_boundary_metadata(),
    )


def get_hyderabad_sensitivity(
    *,
    custom_weights: ScoringWeights | None = None,
    min_places: int = 5,
    min_completeness_pct: float = 0.0,
    top_n: int = 10,
) -> SensitivityResponse:
    effective_custom = custom_weights or ScoringWeights(
        competition_whitespace=55.0,
        food_context=30.0,
        data_reliability=15.0,
    )

    default_rows, eligible_count, _ = compute_all_opportunity_scores(
        weights=DEFAULT_WEIGHTS,
        min_places=min_places,
        min_completeness_pct=min_completeness_pct,
    )
    equal_rows, _, _ = compute_all_opportunity_scores(
        weights=EQUAL_WEIGHTS,
        min_places=min_places,
        min_completeness_pct=min_completeness_pct,
    )
    custom_rows, _, _ = compute_all_opportunity_scores(
        weights=effective_custom,
        min_places=min_places,
        min_completeness_pct=min_completeness_pct,
    )

    def_map = {r.h3_index: r for r in default_rows if r.is_eligible}
    eq_map = {r.h3_index: r for r in equal_rows if r.is_eligible}
    cus_map = {r.h3_index: r for r in custom_rows if r.is_eligible}

    top_default = sorted(def_map.values(), key=lambda r: r.rank or 999999)[:top_n]
    top_def_ids = {r.h3_index for r in top_default}
    top_eq_ids = {
        r.h3_index
        for r in sorted(eq_map.values(), key=lambda r: r.rank or 999999)[:top_n]
    }
    top_cus_ids = {
        r.h3_index
        for r in sorted(cus_map.values(), key=lambda r: r.rank or 999999)[:top_n]
    }

    rows: list[SensitivityCandidateRow] = []
    for r in top_default:
        eq = eq_map[r.h3_index]
        cu = cus_map[r.h3_index]
        d_rank = int(r.rank or 0)
        e_rank = int(eq.rank or 0)
        c_rank = int(cu.rank or 0)
        rows.append(
            SensitivityCandidateRow(
                h3_index=r.h3_index,
                dominant_postcode=r.metrics.dominant_postcode,
                dominant_locality=r.metrics.dominant_locality,
                cafe_count=r.metrics.cafe_count,
                food_business_count=r.metrics.food_business_count,
                default_rank=d_rank,
                default_score=float(r.exploration_score or 0.0),
                equal_rank=e_rank,
                equal_score=float(eq.exploration_score or 0.0),
                custom_rank=c_rank,
                custom_score=float(cu.exploration_score or 0.0),
                max_rank_shift=max(abs(d_rank - e_rank), abs(d_rank - c_rank)),
                remains_in_top_10_all_profiles=(
                    d_rank <= top_n and e_rank <= top_n and c_rank <= top_n
                ),
            )
        )

    return SensitivityResponse(
        city="hyderabad",
        disclaimer=EXPLORATORY_DISCLAIMER,
        default_weights=DEFAULT_WEIGHTS,
        equal_weights=EQUAL_WEIGHTS,
        custom_weights=effective_custom,
        eligible_cells=eligible_count,
        top_10_overlap_default_vs_equal=len(top_def_ids & top_eq_ids),
        top_10_overlap_default_vs_custom=len(top_def_ids & top_cus_ids),
        stable_in_all_three_top_10=len(top_def_ids & top_eq_ids & top_cus_ids),
        candidates=rows,
    )
