"""Unit tests for app/constants.py.

Verifies that the CLIENTS list meets the requirements:
- Between 3 and 5 entries (Requirement 5.2)
- Every entry is a non-empty string (Requirement 5.2)
"""

from app.constants import CLIENTS


def test_clients_has_between_3_and_5_entries():
    """CLIENTS must contain between 3 and 5 entries."""
    assert 3 <= len(CLIENTS) <= 5


def test_clients_all_entries_are_non_empty_strings():
    """Every entry in CLIENTS must be a non-empty string."""
    for entry in CLIENTS:
        assert isinstance(entry, str), f"Expected str, got {type(entry)!r} for {entry!r}"
        assert len(entry) > 0, f"Entry {entry!r} is an empty string"


def test_clients_contains_expected_values():
    """CLIENTS contains the five seeded client names."""
    assert "Acme Corp" in CLIENTS
    assert "Globex Industries" in CLIENTS
    assert "Initech" in CLIENTS
    assert "Umbrella Ltd" in CLIENTS
    assert "Hooli" in CLIENTS
