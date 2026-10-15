from app.schemas import Judgment

# Larping is the game: performing expertise counts twice as much as having it.
WEIGHTS = {"accuracy": 1, "confidence": 2, "delivery": 2}


def final_score(points):
    total = sum(points[name] * weight for name, weight in WEIGHTS.items())
    return round(total / sum(WEIGHTS.values()))


def score(judgment: Judgment):
    points = {name: getattr(judgment, name).rating for name in WEIGHTS}
    return {
        **points,
        "final_score": final_score(points),
        "feedback": {name: getattr(judgment, name).feedback for name in points},
    }
