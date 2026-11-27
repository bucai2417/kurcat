"""Turn the isolated scene library into an ordinary, ready-to-open Blender project.
Run only in a background process opening art/naiwa/naiwa.blend, after export.
"""
import bpy
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
target=ROOT/'art/naiwa/naiwa.blend'
assert bpy.app.background, 'Finalize only in a separate background Blender process'
assert Path(bpy.data.filepath).resolve()==target.resolve(), 'Open the isolated Naiwa file first'
scene=bpy.data.scenes['DIYCat_Naiwa_Studio']
bpy.context.window.scene=scene
for other in list(bpy.data.scenes):
    if other!=scene:bpy.data.scenes.remove(other)
# Frame zero is an unanimated bind pose; playback at frame one still works.
scene.frame_start=0;scene.frame_set(0)
rig=scene.objects['Naiwa_Rig'];rig.data.pose_position='POSE'
for bone in rig.pose.bones:bone.matrix_basis.identity()
if not scene.timeline_markers.get('standing'):scene.timeline_markers.new('standing',frame=0)
for ob in scene.objects:
    if ob.type=='MESH' and ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:key.value=0
for ob in scene.objects:ob.select_set(False)
body=scene.objects['Naiwa_Surface'];body.select_set(True)
bpy.context.view_layer.objects.active=body
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True)
print('Ready-to-open project:',target)
