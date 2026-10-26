"""Temperature formatting that prevents API-visible negative zero."""


def round_temperature(value: float, digits: int = 2) -> float:
    rounded = round(float(value), digits)
    return 0.0 if rounded == 0 else rounded


def normalize_temperature(value: float) -> float:
    """Preserve precision except values that render as negative zero to users."""
    numeric = float(value)
    return 0.0 if round(numeric, 1) == 0 else numeric
