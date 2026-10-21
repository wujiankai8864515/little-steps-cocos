#!/usr/bin/env python3
"""Original, deterministic paper-card effects: mono PCM, no sampled third-party audio."""
from array import array
import math
from pathlib import Path
import random
import wave

RATE = 44100
TARGET = Path(__file__).resolve().parents[1] / 'assets/art/resources/audio/cards'


def render(name, duration, seed, strokes, taps):
    rng = random.Random(seed)
    samples = []
    low = mid = 0.0
    for index in range(round(duration * RATE)):
        t = index / RATE
        noise = rng.uniform(-1, 1)
        low += 0.035 * (noise - low)
        mid += 0.45 * (noise - mid)
        paper = (mid - low) * 0.85 + (noise - mid) * 0.035
        envelope = sum(gain * math.sin(math.pi * (t - start) / length) ** 2
                       for start, length, gain in strokes if start <= t <= start + length)
        value = paper * envelope
        for start, gain in taps:
            if t >= start:
                age = t - start
                value += gain * 0.55 * math.exp(-age * 200) * (
                    (mid - low) * 0.7 + math.sin(age * math.tau * 310) * 0.2
                    + math.sin(age * math.tau * 740) * 0.1)
        # Fade both ends, leaving no discontinuity / click between repeated deals.
        value *= min(1, t / 0.004, (duration - t) / 0.014)
        samples.append(value)
    peak = max(abs(value) for value in samples)
    # Quiet paper movement: about 13 dB below the first candidate, quieter on repeated deals.
    amplitude = 3200 if name == 'deal' else 4200
    pcm = array('h', (round(value / peak * amplitude) for value in samples))
    if __import__('sys').byteorder != 'little':
        pcm.byteswap()
    TARGET.mkdir(parents=True, exist_ok=True)
    with wave.open(str(TARGET / f'card-{name}.wav'), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())


if __name__ == '__main__':
    render('deal', .085, 7101, [(0, .060, .65)], [(.051, .48)])
    render('play', .190, 7102, [(0, .135, .65), (.095, .065, .28)], [(.142, .65)])
    render('draw', .155, 7103, [(0, .080, .55), (.055, .085, .75)], [(.109, .35)])
    render('undo', .220, 7104, [(0, .100, .42), (.065, .135, .62)], [(.177, .50)])
