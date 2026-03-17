def clamp(value, lower=0, upper=10):
    """
    Clamp a value between lower and upper bounds.
    Returns which bound was exceeded, or None if within range.
    """
    if value < lower:
        return 'lower'
    elif value > upper:
        return 'upper'
    else:
        return None
