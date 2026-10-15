"""Counts taken from the Pegasus transcript in Python rather than by the video model.

Video models judge tone and body language well but count poorly, so the transcript sets a
ceiling on the signals that are really counts: a player cannot get a high fluency number
while saying "um" five times, whatever the model's impression was.
"""

import re
from dataclasses import dataclass

FILLERS = {"um", "umm", "uh", "uhh", "erm", "er", "ah", "hmm"}
HEDGES = (
    "i think",
    "i guess",
    "i believe",
    "i'm not sure",
    "im not sure",
    "not sure",
    "i don't know",
    "i dont know",
    "maybe",
    "probably",
    "perhaps",
    "kind of",
    "sort of",
    "might be",
)
HEDGE_PATTERN = re.compile(r"\b(?:" + "|".join(re.escape(h) for h in HEDGES) + r")\b")

# Points taken off each ceiling per occurrence.
FILLER_PENALTY = 10
HEDGE_PENALTY = 12
# Fewer words than this is too short to be an organised answer.
SHORT_ANSWER_WORDS = 8
SHORT_ANSWER_STRUCTURE_CAP = 40


@dataclass(frozen=True)
class SpeechMetrics:
    words: int
    fillers: int
    hedges: int

    @property
    def fluency_cap(self):
        return max(0, 100 - FILLER_PENALTY * self.fillers)

    @property
    def directness_cap(self):
        return max(0, 100 - HEDGE_PENALTY * self.hedges)

    @property
    def structure_cap(self):
        return SHORT_ANSWER_STRUCTURE_CAP if self.words < SHORT_ANSWER_WORDS else 100


def measure(transcript):
    text = transcript.lower().replace("’", "'")
    words = re.findall(r"[a-z']+", text)
    return SpeechMetrics(
        words=len(words),
        fillers=sum(word in FILLERS for word in words),
        hedges=len(HEDGE_PATTERN.findall(text)),
    )
