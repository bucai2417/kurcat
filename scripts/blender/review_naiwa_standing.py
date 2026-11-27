"""Render the standing form for silhouette review, without touching other projects."""
import bpy
from pathlib import Path
from mathutils import Vector
assert bpy.app.background
scene=bpy.data.scenes['DIYCat_Naiwa_Studio'];bpy.context.window.scene=scene
scene.objects['Naiwa_Rig'].data.pose_position='REST'
for ob in scene.objects:
    if ob.type=='MESH' and ob.data.shape_keys:
        for k in ob.data.shape_keys.key_blocks:k.value=0
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=800;scene.render.resolution_y=900
out=Path(__file__).resolve().parents[2]/'art/naiwa/previews';out.mkdir(exist_ok=True,parents=True)
for name,xyz in [('front',(0,-9,1.51)),('standing',(3.2,-9,2.6)),('side',(9,0,1.51)),('back',(0,9,1.51))]:
    scene.camera.location=xyz
    scene.camera.rotation_euler=(Vector((0,0,1.51))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.ortho_scale=3.48
    scene.render.filepath=str(out/(name+'.png'))
    bpy.ops.render.render(write_still=True)
print('Standing silhouette review completed')
