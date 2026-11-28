"""Assemble the authored Naiwa frame sequence using existing Pillow and ffmpeg."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg', help='Path to an existing ffmpeg executable')
args = parser.parse_args()
frames = ROOT / 'node_modules/.cache/naiwa-reference/gesture-frames'
out = ROOT / 'art/naiwa/previews'
fps, count = 24, 192
manifest = frames / 'complete.json'
if not manifest.is_file():
    raise SystemExit('No completed render sequence; run render_naiwa_motion.py first')
metadata = json.loads(manifest.read_text(encoding='utf-8'))
expected_metadata = {'clip': 'delight', 'fps': fps, 'frames': count, 'width': 360, 'height': 440}
if any(metadata.get(key) != value for key, value in expected_metadata.items()):
    raise SystemExit('Unexpected render metadata; render the sequence again')
digest = hashlib.sha256()
with (ROOT / 'art/naiwa/naiwa.blend').open('rb') as stream:
    for block in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(block)
if metadata.get('sourceSha256') != digest.hexdigest():
    raise SystemExit('The model changed after rendering; render the sequence again')
expected = [frames / f'{index:04}.png' for index in range(count)]
for frame in expected:
    if not frame.is_file():
        raise SystemExit(f'Missing frame: {frame}')
    with Image.open(frame) as image:
        if image.size != (360, 440):
            raise SystemExit(f'Unexpected frame size: {frame}: {image.size}')
out.mkdir(parents=True, exist_ok=True)
# Older Windows ffmpeg binaries cannot decode Unicode absolute path arguments.
# Relative ASCII paths resolve inside the Unicode working directory correctly.
subprocess.run([args.ffmpeg, '-y', '-framerate', str(fps), '-i',
                str(frames.relative_to(ROOT) / '%04d.png'),
                '-frames:v', str(count), '-c:v', 'libx264', '-threads', '2',
                '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
                str(out.relative_to(ROOT) / 'gesture.mp4')], cwd=ROOT, check=True)
# Use the same frames as the video, including both ends of the gesture.
sheet = Image.new('RGB', (768, 774), '#f6f5ef')
draw = ImageDraw.Draw(sheet)
for cell in range(12):
    index = round(cell * (count - 1) / 11)
    x, y = (cell % 4) * 192, (cell // 4) * 258
    with Image.open(expected[index]) as image:
        image = image.convert('RGB').resize((180, 220), Image.Resampling.LANCZOS)
        sheet.paste(image, (x + 6, y + 6))
    draw.text((x + 10, y + 234), f'{index / fps:.2f} s', fill='#30422d')
sheet.save(out / 'gesture-sheet.jpg', quality=92)
print(f'Created {count / fps:g}s / {fps}fps video and 12-frame sheet in {out}')
