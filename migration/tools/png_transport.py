"""Encode opaque source pixels as RGB PNG without changing decoded RGBA."""
import io
from PIL import Image


def exact_png(image):
    rgba = image.convert('RGBA')
    candidates = [rgba]
    if rgba.getchannel('A').getextrema() == (255, 255):
        candidates.append(rgba.convert('RGB'))
    outputs = []
    for candidate in candidates:
        stream = io.BytesIO()
        candidate.save(stream, format='PNG', optimize=True)
        data = stream.getvalue()
        decoded = Image.open(io.BytesIO(data)).convert('RGBA')
        if decoded.size != rgba.size or decoded.tobytes() != rgba.tobytes():
            raise ValueError('PNG transport changed original RGBA pixels')
        outputs.append(data)
    return min(outputs, key=len)
