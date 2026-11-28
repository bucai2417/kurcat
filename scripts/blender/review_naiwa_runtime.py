"""Render actual Three.js deformed geometry exported by check-naiwa-runtime --review.
Uses a separate background Blender; never modifies the user's open scene or source asset.
"""
import bpy, json, sys
from pathlib import Path
from mathutils import Vector, Quaternion
from math import pi, tan
assert bpy.app.background, 'Run in background Blender'
folder=Path(__file__).resolve().parents[2]/'node_modules/.cache/naiwa-live-review'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=12;scene.cycles.use_denoising=False
scene.render.resolution_x=600;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Studio');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.72,.74,.70,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
scene.view_settings.view_transform='AgX'
for name,loc,power,size in [('Key',(-3,-4,6),700,5),('Fill',(4,-2,4),350,4)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
 obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc
 obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',data);scene.collection.objects.link(cam);scene.camera=cam
cam.location=(3,-7,3.5);cam.rotation_euler=(Vector((0,-.2,1.15))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=3.6
bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object;ground.name='Ground';ground.location.z=-.03
names = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['desk','wave','gaze','nap','roll']
for filename in names:
 raw=json.loads((folder/(filename+'.json')).read_text(encoding='utf-8'));objects=[]
 if 'camera' in raw:
  c=raw['camera'];x,y,z=c['position'];cam.location=(x,-z,y)
  x,y,z,w=c['quaternion'];cam.rotation_mode='QUATERNION';cam.rotation_quaternion=Quaternion((1,0,0),pi/2) @ Quaternion((w,x,y,z))
  if c.get('ortho',False):
   data.type='ORTHO';data.ortho_scale=c['height']*max(1,c['aspect'])
  else:
   data.type='PERSP';data.sensor_fit='VERTICAL';data.sensor_height=32;data.lens=32/(2*tan(c['fov']*pi/360))
  scene.render.resolution_x=760;scene.render.resolution_y=round(760/c['aspect'])
 for item in raw['meshes']:
  p=item['positions'];idx=item['indices'];mesh=bpy.data.meshes.new(item['name'])
  mesh.from_pydata([(p[i],-p[i+2],p[i+1]) for i in range(0,len(p),3)],[],[idx[i:i+3] for i in range(0,len(idx),3)]);mesh.update()
  obj=bpy.data.objects.new(item['name'],mesh);scene.collection.objects.link(obj);objects.append(obj)
  for poly in mesh.polygons:poly.use_smooth=True
  mat=bpy.data.materials.new(item['name']);mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*item['color'],1);bs.inputs['Roughness'].default_value=item.get('roughness',.65);bs.inputs['Metallic'].default_value=item.get('metallic',0);bs.inputs['Alpha'].default_value=item.get('opacity',1)
  if item.get('colors'):
   attr=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='POINT');colors=item['colors']
   for i,entry in enumerate(attr.data):entry.color=(*colors[i*3:i*3+3],1)
   node=mat.node_tree.nodes.new('ShaderNodeVertexColor');node.layer_name='Color';mat.node_tree.links.new(node.outputs['Color'],bs.inputs['Base Color'])
  if item['uv'] and item['texture'] is not None:
   uv=mesh.uv_layers.new();coords=item['uv']
   for loop in mesh.loops:uv.data[loop.index].uv=(coords[2*loop.vertex_index],1-coords[2*loop.vertex_index+1])
   source=raw['meta']['textures'][item['texture']]['source'];tex=mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(folder/f'texture-{source}.png'),check_existing=True)
   mat.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
  obj.data.materials.append(mat)
 scene.render.filepath=str(folder/(filename+'.png'));bpy.ops.render.render(write_still=True)
 for obj in objects:
  mesh=obj.data;bpy.data.objects.remove(obj,do_unlink=True);bpy.data.meshes.remove(mesh)
print('Runtime review saved:',folder,flush=True)
