from datetime import date

import pytest

from app.scheduler import is_last_business_day_of_month


pytestmark = pytest.mark.unit


@pytest.mark.parametrize(
    ("day", "expected"),
    [
        (date(2026, 5, 29), True),  # Friday before a weekend month end.
        (date(2026, 5, 28), False),
        (date(2026, 5, 30), False),
        (date(2026, 6, 30), True),  # Month ends on Tuesday.
        (date(2026, 2, 27), True),  # Friday before Saturday month end.
    ],
)
def test_is_last_business_day_of_month(day, expected):
    assert is_last_business_day_of_month(day) is expected
