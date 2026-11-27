"""Save only the Naiwa scene and export its character, never the open project."""
import bpy
from pathlib import Path
ROOT=__file__.replace('\\','/').rsplit('/',3)[0]
Path(ROOT+'/art/naiwa').mkdir(parents=True,exist_ok=True)
scene=bpy.data.scenes['DIYCat_Naiwa_Studio']
bpy.context.window.scene=scene
# This authoring scene can share a Blender session with unrelated projects.
for ob in list(scene.collection.objects):scene.collection.objects.unlink(ob)
for col in list(scene.collection.children):
    if not col.name.startswith('NAIWA_'):scene.collection.children.unlink(col)
character=next(c for c in scene.collection.children if c.name.startswith('NAIWA_Character'))
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
for ob in character.all_objects:ob.select_set(True)
bpy.context.view_layer.objects.active=scene.objects['Naiwa_Rig']
bpy.ops.export_scene.gltf(filepath=ROOT+'/art/naiwa/naiwa.glb',export_format='GLB',use_selection=True,use_active_scene=True,collection=character.name,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,
    export_frame_range=False,export_frame_step=1,export_anim_slide_to_zero=True,export_rest_position_armature=True,
    export_def_bones=False,export_skins=True,export_all_influences=False,
    export_morph=True,export_morph_animation=True,export_yup=True,export_extras=True)
scene.frame_set(1)
bpy.data.libraries.write(ROOT+'/art/naiwa/naiwa.blend',{scene},fake_user=True,compress=True)
print('Saved isolated Naiwa blend and animated GLB to art/naiwa/')
