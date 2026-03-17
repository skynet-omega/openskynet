import pytest
from range_tools import clamp

def test_clamp_below_lower():
    """Test that values below lower bound return 'lower'"""
    assert clamp(-5, lower=0, upper=10) == 'lower'

def test_clamp_above_upper():
    """Test that values above upper bound return 'upper'"""
    assert clamp(15, lower=0, upper=10) == 'upper'

def test_clamp_within_range():
    """Test that values within range return None"""
    assert clamp(5, lower=0, upper=10) is None
