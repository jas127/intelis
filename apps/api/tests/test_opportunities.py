import pytest
from app.main import app
from app.services.opportunity_service import (
    DEFAULT_WEIGHTS,
    _average_percentile_ranks,
    compute_all_opportunity_scores,
    validate_weights,
)
from fastapi.testclient import TestClient

client = TestClient(app)


def test_average_percentile_ranks_handles_ties_and_order() -> None:
    # Ties at 10.0 should get identical average-rank percentiles
    pcts = _average_percentile_ranks([10.0, 10.0, 20.0, 30.0])
    assert pcts[0] == pcts[1]
    assert pcts[0] < pcts[2] < pcts[3]
    assert pcts[3] == 100.0
    assert _average_percentile_ranks([42.0]) == [50.0]


def test_weight_validation() -> None:
    w = validate_weights(40, 35, 25)
    assert w.competition_whitespace == 40.0
    assert w.food_context == 35.0
    assert w.data_reliability == 25.0

    with pytest.raises(ValueError, match="sum to 100"):
        validate_weights(50, 30, 10)

    with pytest.raises(ValueError, match="between 0 and 100"):
        validate_weights(-5, 55, 50)


def test_sliver_and_missing_data_exclusion_and_reproducibility() -> None:
    rows_a, elig_a, excl_a = compute_all_opportunity_scores(weights=DEFAULT_WEIGHTS)
    rows_b, elig_b, _ = compute_all_opportunity_scores(weights=DEFAULT_WEIGHTS)

    assert len(rows_a) == 975
    assert elig_a + excl_a == 975
    assert elig_a == elig_b
    assert [r.h3_index for r in rows_a if r.rank == 1] == [
        r.h3_index for r in rows_b if r.rank == 1
    ]

    # Every low-area sliver must be excluded and have NULL score
    slivers = [r for r in rows_a if r.metrics.low_area_flag]
    assert len(slivers) == 97
    for s in slivers:
        assert s.is_eligible is False
        assert s.exploration_score is None
        assert "sliver" in (s.exclusion_reason or "").lower()

    # Every eligible cell must have all 3 component scores in [0, 100] and valid weighted sum
    for r in rows_a:
        if r.is_eligible:
            assert r.competition_whitespace_score is not None
            assert r.food_context_score is not None
            assert r.data_reliability_score is not None
            assert r.exploration_score is not None
            expected = round(
                0.40 * r.competition_whitespace_score
                + 0.35 * r.food_context_score
                + 0.25 * r.data_reliability_score,
                2,
            )
            assert abs(r.exploration_score - expected) <= 0.02


def test_opportunities_api_endpoints_and_validation() -> None:
    resp = client.get("/api/v1/cities/hyderabad/opportunities?limit=10")
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["score_label"] == "Exploratory Market Screening Score"
    assert payload["returned"] == 10
    assert payload["eligible_cells"] > 0
    assert payload["excluded_cells"] >= 97

    top = payload["candidates"][0]
    assert top["rank"] == 1
    assert top["is_eligible"] is True
    assert top["exploration_score"] is not None
    assert top["explanation"]

    # Detail endpoint for top candidate
    detail_resp = client.get(
        f"/api/v1/cities/hyderabad/opportunities/{top['h3_index']}"
    )
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["candidate"]["h3_index"] == top["h3_index"]
    assert detail["candidate"]["exploration_score"] == top["exploration_score"]

    # Sensitivity endpoint
    sens_resp = client.get(
        "/api/v1/cities/hyderabad/opportunities/sensitivity"
        "?w_competition=55&w_food_context=30&w_reliability=15"
    )
    assert sens_resp.status_code == 200
    sens = sens_resp.json()
    assert len(sens["candidates"]) == 10
    assert 0 <= sens["top_10_overlap_default_vs_equal"] <= 10
    assert 0 <= sens["stable_in_all_three_top_10"] <= 10

    # Invalid weights -> 400
    bad_weights = client.get(
        "/api/v1/cities/hyderabad/opportunities?w_competition=50&w_food_context=50&w_reliability=50"
    )
    assert bad_weights.status_code == 400

    # Unknown H3 cell -> 404
    missing_cell = client.get(
        "/api/v1/cities/hyderabad/opportunities/not_a_real_cell"
    )
    assert missing_cell.status_code == 404
