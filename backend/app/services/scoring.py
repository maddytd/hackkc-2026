from app.schemas import Judgment


def score(judgment: Judgment):
    points = {
        name: getattr(judgment, name).rating for name in ("accuracy", "confidence", "delivery")
    }
    return {
        **points,
        "final_score": round(sum(points.values()) / 3),
        "feedback": {name: getattr(judgment, name).feedback for name in points},
    }
