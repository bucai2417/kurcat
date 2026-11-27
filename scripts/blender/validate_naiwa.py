"""Re-import and visually inspect the exported GLB in an isolated background process.
Outputs are authoring evidence, not desktop runtime tests. Never saves the open file.
"""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
assert bpy.app.background,'Use a separate background Blender process'
author=bpy.data.scenes['DIYCat_Naiwa_Studio']
out=ROOT/'art/naiwa/previews';out.mkdir(parents=True,exist_ok=True)
# A closed surface can still contain accidental tunnels between fingers.
# The character's continuous skin must be a single genus-zero manifold.
bm=bmesh.new();bm.from_mesh(author.objects['Naiwa_Surface'].data)
remaining=set(bm.verts);components=0
while remaining:
    components+=1;stack=[remaining.pop()]
    while stack:
        vertex=stack.pop()
        for edge in vertex.link_edges:
            other=edge.other_vert(vertex)
            if other in remaining:remaining.remove(other);stack.append(other)
euler=len(bm.verts)-len(bm.edges)+len(bm.faces)
nonmanifold=sum(not edge.is_manifold for edge in bm.edges)
assert components==1, f'Detached body/limb geometry: {components} components'
assert nonmanifold==0, f'Open or non-manifold skin: {nonmanifold} edges'
assert euler==2, f'Unexpected finger/limb tunnel: Euler characteristic {euler}'
print('PASS continuous skin: one closed component, Euler 2, no finger tunnels',flush=True)
bm.free()
def configure(scene):
    scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=True
    scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100
    scene.render.use_compositing=False;scene.render.use_sequencer=False
    scene.render.image_settings.file_format='PNG'
def camera_at(scene,xyz,target=(0,0,1.45)):
    scene.camera.location=xyz
    scene.camera.rotation_euler=(Vector(target)-scene.camera.location).to_track_quat('-Z','Y').to_euler()
def render(scene,name):
    bpy.context.window.scene=scene
    scene.render.filepath=str(out/(name+'.png'))
    bpy.ops.render.render(write_still=True,scene=scene.name)
configure(author)
rig=author.objects['Naiwa_Rig']
author.frame_set(0);rig.data.pose_position='REST'
for ob in author.objects:
    if ob.type=='MESH' and ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:key.value=0
author.render.resolution_x=800;author.render.resolution_y=900
author.camera.data.ortho_scale=3.48
for name,xyz in [('front',(0,-9,1.51)),('standing',(3.2,-9,2.6)),('side',(9,0,1.51)),('back',(0,9,1.51))]:
    camera_at(author,xyz,target=(0,0,1.51));render(author,name)
configure(author)
rig.data.pose_position='POSE'
camera_at(author,(3.7,-9,3.3),target=(0,0,1.25))
ranges={clip['name']:clip for clip in json.loads(author['clip_ranges'])}
for name,clip,seconds in [('seated','idle',0),('mouse','mouse',1.5),('nap','nap',3),('wave','wave',1.5),('angry','angry',1.5)]:
    author.frame_set(ranges[clip]['start']+round(seconds*30));render(author,name)
# A fresh glTF import is independent of Blender's original modifiers/constraints.
check=bpy.data.scenes.new('Naiwa_Export_Check');check.render.fps=30
bpy.context.window.scene=check
bpy.ops.import_scene.gltf(filepath=str(ROOT/'art/naiwa/naiwa.glb'))
imported=list(check.objects)
for ob in imported:
    if ob.type=='MESH' and ob.name.startswith('Naiwa_Surface'):
        assert len(ob.data.vertices)>30000
for col in author.collection.children:
    if col.name.startswith('NAIWA_Studio'):
        for ob in col.objects:
            duplicate=ob.copy()
            if ob.data:duplicate.data=ob.data.copy()
            check.collection.objects.link(duplicate)
            if ob==author.camera:check.camera=duplicate
check.world=author.world;check.view_settings.view_transform=author.view_settings.view_transform
configure(check)
for name,time in [('nap',3),('wave',1.5)]:
    for ob in imported:
        owners=[ob]
        if ob.type=='MESH' and ob.data.shape_keys:owners.append(ob.data.shape_keys)
        for owner in owners:
            ad=owner.animation_data
            if not ad:continue
            ad.action=None
            for track in ad.nla_tracks:track.mute=track.name!=name
    check.frame_set(1+int(time*30))
    render(check,'export-'+name)
print('Rendered source views and independent GLB nap/wave into',out)
