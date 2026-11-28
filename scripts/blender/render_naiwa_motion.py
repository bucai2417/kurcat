"""Render the reference-inspired gesture as real sampled frames, without building the app.
Assemble the PNGs with the already installed ffmpeg; see docs/naiwa-3d-design.md.
"""
import bpy, hashlib, json, math
import sys
from pathlib import Path
from mathutils import Vector
LOW_MEMORY = '--low-memory' in sys.argv
assert bpy.app.background, 'Use a separate background Blender process'
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'art/naiwa/naiwa.blend'
assert Path(bpy.data.filepath).resolve()==source.resolve(), 'Open art/naiwa/naiwa.blend before rendering'
scene=bpy.data.scenes['DIYCat_Naiwa_Studio'];bpy.context.window.scene=scene
scene.objects['Naiwa_Rig'].data.pose_position='POSE'
clip=next(c for c in json.loads(scene['clip_ranges']) if c['name']=='delight')
out=ROOT/'node_modules/.cache/naiwa-reference/gesture-frames';out.mkdir(parents=True,exist_ok=True)
# Invalidate the previous completion marker before overwriting any frames.
manifest=out/'complete.json';manifest.unlink(missing_ok=True)
digest=hashlib.sha256()
with source.open('rb') as stream:
    for block in iter(lambda:stream.read(1024*1024),b''):digest.update(block)
scene.render.engine='CYCLES';scene.cycles.samples=16 if LOW_MEMORY else 6;scene.cycles.use_denoising=not LOW_MEMORY
scene.render.use_persistent_data=True
scene.render.resolution_x=360;scene.render.resolution_y=440;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.use_compositing=False;scene.render.use_sequencer=False
scene.camera.location=(3.2,-9,2.7)
scene.camera.rotation_euler=(Vector((0,0,1.53))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=3.55
fps=24;count=round(clip['seconds']*fps)
for index in range(count):
    frame=clip['start']+index*30/fps
    scene.frame_set(math.floor(frame),subframe=frame%1)
    scene.render.filepath=str(out/f'{index:04}.png')
    bpy.ops.render.render(write_still=True)
    if index%24==0:print(f'Gesture frames: {index}/{count}',flush=True)
manifest.write_text(json.dumps({'sourceSha256':digest.hexdigest(),'clip':'delight','fps':fps,'frames':count,'width':360,'height':440},indent=2)+'\n',encoding='utf-8')
print('Motion frames:',out,flush=True)
