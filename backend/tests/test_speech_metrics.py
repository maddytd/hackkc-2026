from app.ai.speech_metrics import measure


def test_counts_vocal_fillers_but_not_ordinary_words():
    metrics = measure("Um, it's like, uh, basically the ozone layer. Umm.")
    assert metrics.fillers == 3
    assert metrics.fluency_cap == 70


def test_counts_hedges_including_curly_apostrophes():
    metrics = measure("I don\u2019t know, maybe it's sort of nitrogen? I think so.")
    assert metrics.hedges == 4
    assert metrics.directness_cap == 52


def test_hedge_words_inside_other_words_do_not_count():
    assert measure("Kindness and sorting algorithms, probabilistically.").hedges == 0


def test_short_answers_cap_structure():
    assert measure("Helium.").structure_cap == 40
    assert measure("Helium, because it is lighter than the surrounding air.").structure_cap == 100


def test_caps_never_go_below_zero():
    assert measure("um " * 20).fluency_cap == 0
