"""Build the editable Naiwa authoring prototype in its own Blender scene.
Run in Blender's Text Editor, or blender --background --python this_file.py.
Only this script's scene is replaced. It never saves over the opened project.
"""
import bpy, math, json
from mathutils import Vector, Matrix, Quaternion
SCENE = 'DIYCat_Naiwa_Studio'
# Replace only the authoring scene owned by this script.
old = bpy.data.scenes.get(SCENE)
if old:
    owned = [c for c in old.collection.children if c.name.startswith('NAIWA_')]
    objects = set(o for c in owned for o in c.all_objects)
    # Other projects may share this Blender session: never delete their data.
    for obj in objects:
        if all(s == old for s in obj.users_scene):
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(old)
    for col in owned:
        if col.users == 0: bpy.data.collections.remove(col)
scene = bpy.data.scenes.new(SCENE)
bpy.context.window.scene = scene
character = bpy.data.collections.new('NAIWA_Character')
studio = bpy.data.collections.new('NAIWA_Studio')
scene.collection.children.link(character)
scene.collection.children.link(studio)
scene['integration_status'] = 'Authoring prototype. Desktop external GLB adapter is not implemented.'
scene['reference'] = 'User Naiwa front / side / back reference, 2026-11-28; hand posture also studied from supplied motion video'

def smooth(a,b,x):
    t = max(0., min(1., (x-a)/(b-a)))
    return t*t*(3-2*t)
def material(name,color,rough=.55):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
    bs.name='Principled BSDF'
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=rough
    return mat
skin=material('Naiwa | golden skin',(1,.59,.012),.54)
cream=material('Naiwa | warm belly',(.92,.82,.61),.6)
iris=material('Naiwa | moss green eyes',(.19,.38,.045),.48)
black=material('Naiwa | pupils',(.006,.009,.003),.32)
mouthmat=material('Naiwa | smile',(.075,.032,.006),.6)
saliva=material('Naiwa | saliva',(.20,.65,.8),.2)
bs=saliva.node_tree.nodes['Principled BSDF']
bs.inputs['Coat Weight'].default_value=.6

verts=[]; faces=[]
def mesh(name,vs,fs,coll=character):
    me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update()
    ob=bpy.data.objects.new(name,me); coll.objects.link(ob)
    for f in me.polygons:f.use_smooth=True
    return ob

def ellipsoid(center,scale,vs=verts,fs=faces,segments=24,rings=14):
    offset=len(vs)
    vs.append((center[0],center[1],center[2]-scale[2]))
    for j in range(1,rings):
        theta=math.pi*j/rings
        for i in range(segments):
            a=2*math.pi*i/segments
            vs.append((center[0]+scale[0]*math.sin(theta)*math.cos(a),center[1]+scale[1]*math.sin(theta)*math.sin(a),center[2]-scale[2]*math.cos(theta)))
    top=len(vs);vs.append((center[0],center[1],center[2]+scale[2]))
    for i in range(segments):fs.append((offset,offset+1+(i+1)%segments,offset+1+i))
    for j in range(rings-2):
        for i in range(segments):
            a=offset+1+j*segments+i;b=offset+1+j*segments+(i+1)%segments
            fs.append((a,b,b+segments,a+segments))
    for i in range(segments):fs.append((top,offset+1+(rings-2)*segments+i,offset+1+(rings-2)*segments+(i+1)%segments))

def tube(points,radii,vs=verts,fs=faces,sides=16):
    offset=len(vs)
    for i,pt in enumerate(points):
        tangent=Vector(points[min(len(points)-1,i+1)])-Vector(points[max(0,i-1)])
        tangent.normalize()
        axis=Vector((0,1,0))
        if abs(tangent.dot(axis))>.95:axis=Vector((1,0,0))
        u=tangent.cross(axis).normalized();v=tangent.cross(u).normalized()
        for k in range(sides):
            a=k*2*math.pi/sides
            vs.append(tuple(Vector(pt)+radii[i]*(math.cos(a)*u+math.sin(a)*v)))
        if i:
            for k in range(sides):
                a=offset+(i-1)*sides+k;b=offset+(i-1)*sides+(k+1)%sides
                fs.append((a,b,b+sides,a+sides))
    fs.append(tuple(offset+i for i in reversed(range(sides))))
    fs.append(tuple(offset+(len(points)-1)*sides+i for i in range(sides)))

def catmull(values,count=5):
    result=[]
    for i in range(len(values)-1):
        a=Vector(values[max(0,i-1)]);b=Vector(values[i]);c=Vector(values[i+1]);d=Vector(values[min(len(values)-1,i+2)])
        for j in range(count):
            t=j/count
            result.append(tuple(.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)))
    result.append(values[-1]);return result
# Ring profile: z, half width, depth, Y centre. Front is -Y.
profile=[(.70,.07,.12,.015),(.78,.28,.29,.01),(.91,.44,.40,-.01),(1.10,.57,.49,-.025),(1.35,.65,.55,-.025),(1.60,.665,.56,-.015),(1.83,.62,.51,.005),(2.04,.52,.43,.025),(2.21,.425,.355,.035),(2.36,.375,.31,.025),(2.52,.345,.29,.01),(2.70,.326,.28,0),(2.88,.303,.263,.005),(3.04,.249,.224,.015),(3.15,.155,.146,.025),(3.20,.012,.012,.025)]
rings=catmull(profile,5);n=64
for z,rx,ry,cy in rings:
    for i in range(n):
        a=2*math.pi*i/n
        verts.append((rx*math.cos(a),cy+ry*math.sin(a),z))
for j in range(len(rings)-1):
    for i in range(n):
        a=j*n+i;b=j*n+(i+1)%n;faces.append((a,b,b+n,a+n))
faces.extend([tuple(reversed(range(n))),tuple((len(rings)-1)*n+i for i in range(n))])
# The root begins INSIDE the neck/shoulder volume, so its union never makes a
# separate deltoid cap. The wrist continues the same descending tangent.
arm_path=[(.20,.045,2.36),(.52,.035,2.19),(.80,.005,1.98),(.84,-.035,1.72),(.84,-.08,1.46),(.805,-.12,1.24),(.78,-.155,1.085)]
arm_r=[.18,.17,.14,.125,.105,.093,.076]
paths={};digit_paths={};leg_paths={};toes={};hand_tips={};hand_normals={};grips={}
for side,sign in [('L',1),('R',-1)]:
    p=[(sign*x,y,z) for x,y,z in arm_path]; paths[side]=p
    ar=catmull([(*a,r) for a,r in zip(p,arm_r)],5)
    tube([a[:3] for a in ar],[a[3] for a in ar])
    # The resting palm faces inward 48 degrees, as in the supplied three views.
    # A thick oval palm and short curled digits share the wrist's volume.
    angle=math.radians(48)
    across=Vector((sign*math.cos(angle),-math.sin(angle),0))
    forward=Vector((-sign*math.sin(angle),-math.cos(angle),0))
    center=Vector((sign*.775,-.16,1.045))
    def hand_point(u,v,z):return tuple(center+across*u+forward*v+Vector((0,0,z)))
    hand_normals[side]=forward
    hand_tips[side]=hand_point(0,.012,-.065)
    grips[side]=hand_point(0,.065,-.045)
    pv=[];pf=[];ellipsoid((0,0,0),(.096,.070,.088),pv,pf,32,20)
    off=len(verts);verts.extend(hand_point(*v) for v in pv);faces.extend(tuple(off+i for i in f) for f in pf)
    for digit in range(3):
        lane=digit-1
        # Webbed roots separate monotonically into rounded pads: no tunnels.
        pp=[hand_point(lane*.053,.008,-.032),
            hand_point(lane*.080,.020,-.102+abs(lane)*.008),
            hand_point(lane*.080,.059,-.132+abs(lane)*.010)]
        digit_paths[f'finger{digit+1}.{side}']=pp
        sp=catmull([(*a,r) for a,r in zip(pp,[.037,.031,.027])],6)
        tube([a[:3] for a in sp],[a[3] for a in sp])
        ellipsoid(pp[-1],(.027,.027,.027),segments=24,rings=14)
    # Fill the thumb web continuously; a bent thumb must not form a tiny tunnel.
    pv=[];pf=[];ellipsoid((-.076,.028,-.014),(.057,.045,.043),pv,pf,24,14)
    off=len(verts);verts.extend(hand_point(*v) for v in pv);faces.extend(tuple(off+i for i in f) for f in pf)
    pp=[hand_point(-.065,.006,.012),hand_point(-.112,.033,-.008),hand_point(-.111,.067,-.040)]
    digit_paths[f'thumb.{side}']=pp
    sp=catmull([(*a,r) for a,r in zip(pp,[.037,.033,.028])],6)
    tube([a[:3] for a in sp],[a[3] for a in sp]);ellipsoid(pp[-1],(.029,.029,.030),segments=24,rings=14)
    # Rounded tapered legs with an actual crotch gap below the pelvis.
    lp=[(sign*.31,.035,.91),(sign*.365,.035,.66),(sign*.42,.015,.40),(sign*.46,-.035,.12)]
    leg_paths[side]=lp
    sp=catmull([(*a,r) for a,r in zip(lp,[.205,.166,.108,.061])],6)
    tube([a[:3] for a in sp],[a[3] for a in sp]);ellipsoid(lp[0],(.205,.21,.21))
    # Broad, low, outward-facing feet, with three rounded toe tips.
    ellipsoid((sign*.535,-.112,.064),(.195,.17,.061))
    for k in range(3):
        pp=[(sign*(.46+k*.026),-.10,.067),
            (sign*(.425+k*.13),-.33+k*.065,.036)]
        toes[f'toe{k+1}.{side}']=pp
        tube(pp,[.048,.034]);ellipsoid(pp[-1],(.047,.046,.033),segments=20,rings=12)
body=mesh('Naiwa_Surface',verts,faces)
bpy.context.view_layer.objects.active=body;body.select_set(True)
remesh=body.modifiers.new('Continuous shoulder, palm and hip surface','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.012;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
print("Naiwa remeshed:",len(body.data.vertices),flush=True)
# Fair the shoulder union over a broad region, without shrinking the fingers.
shoulder_group=body.vertex_groups.new(name='Shoulder fairing')
for v in body.data.vertices:
    x,y,z=v.co
    weight=smooth(1.90,2.15,z)*(1-smooth(2.48,2.65,z))*smooth(.15,.35,abs(x))
    if weight>0:shoulder_group.add([v.index],weight,'REPLACE')
sm=body.modifiers.new('Continuous shoulder fairing','SMOOTH');sm.factor=.85;sm.iterations=40;sm.vertex_group=shoulder_group.name
bpy.ops.object.modifier_apply(modifier=sm.name);body.vertex_groups.remove(body.vertex_groups['Shoulder fairing'])
sm=body.modifiers.new('Relax continuous skin','SMOOTH');sm.factor=.65;sm.iterations=5;bpy.ops.object.modifier_apply(modifier=sm.name)
dec=body.modifiers.new('Authoring base cage','DECIMATE');dec.ratio=.12;bpy.ops.object.modifier_apply(modifier=dec.name)
print('Naiwa base cage:',len(body.data.vertices),flush=True)
sub=body.modifiers.new('Rounded authoring surface','SUBSURF');sub.levels=1;sub.render_levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
print('Naiwa smooth surface:',len(body.data.vertices),flush=True)
for f in body.data.polygons:f.use_smooth=True
body.data.materials.append(skin)
# A packed UV atlas keeps the cream belly edge clean even at close range.
# Front/back occupy separate halves. UVs follow the skin through deformation.
import numpy as np
tex_w,tex_h=2048,1024
u=(np.arange(tex_w,dtype=np.float32)+.5)/tex_w
v=(np.arange(tex_h,dtype=np.float32)+.5)/tex_h
xx=((u*2)%1)*2.4-1.2
zz=v*3.4-.1
X,Z=np.meshgrid(xx,zz)
def smooth_array(a,b,x):
    t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
height=np.where(Z>1.63,.55,.40)
region=(X/.625)**2+((Z-1.63)/height)**2
belly=(1-smooth_array(.995,1.005,region))*(u[None,:]<.5)
hand=smooth_array(.55,.60,np.abs(X))*(1-smooth_array(1.085,1.16,Z))
foot=1-smooth_array(.12,.23,Z)
dark=np.maximum(hand,foot)
yellow=np.array([1,.59,.012],dtype=np.float32)
cream_rgb=np.array([.92,.82,.61],dtype=np.float32)
olive=np.array([.075,.085,.022],dtype=np.float32)
rgb=yellow[None,None,:]*(1-belly[:,:,None])+cream_rgb[None,None,:]*belly[:,:,None]
rgb=rgb*(1-dark[:,:,None])+olive[None,None,:]*dark[:,:,None]
# Image pixels are stored as sRGB; material values above are linear RGB.
rgb=np.where(rgb<=.0031308,rgb*12.92,1.055*np.power(rgb,1/2.4)-.055)
pixels=np.ones((tex_h,tex_w,4),dtype=np.float32);pixels[:,:,:3]=rgb
image=bpy.data.images.new('Naiwa Skin Atlas',width=tex_w,height=tex_h,alpha=False)
image.colorspace_settings.name='sRGB';image.pixels.foreach_set(pixels.ravel());image.pack()
uv=body.data.uv_layers.new(name='SkinAtlas')
for face in body.data.polygons:
    back=sum(body.data.vertices[i].co.y for i in face.vertices)>0
    for li in face.loop_indices:
        p=body.data.vertices[body.data.loops[li].vertex_index].co
        uv.data[li].uv=((p.x+1.2)/2.4*.5+(.5 if back else 0),(p.z+.1)/3.4)
bs=skin.node_tree.nodes['Principled BSDF']
tex=skin.node_tree.nodes.new('ShaderNodeTexImage');tex.image=image;tex.interpolation='Linear'
skin.node_tree.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
del X,Z,rgb,pixels,belly,dark,region,hand,foot
# Skeleton.
ad=bpy.data.armatures.new('Naiwa_FlexibleRig');rig=bpy.data.objects.new('Naiwa_Rig',ad);character.objects.link(rig)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None,deform=True):
    b=ad.edit_bones.new(name);b.head=head;b.tail=tail;b.use_deform=deform
    if parent:b.parent=ad.edit_bones[parent]
    return b
bone('root',(0,0,0),(0,0,.3),deform=False)
bone('pelvis',(0,0,.74),(0,0,1.05),'root')
bone('spine',(0,0,1.05),(0,0,1.65),'pelvis')
bone('chest',(0,0,1.65),(0,0,2.25),'spine')
bone('neck',(0,0,2.25),(0,0,2.67),'chest')
bone('head',(0,0,2.67),(0,0,3.2),'neck')
for side,sign in [('L',1),('R',-1)]:
    bone('clavicle.'+side,(sign*.18,0,2.22),paths[side][0],'chest')
    prev='clavicle.'+side
    # Only the inner shoulder stays rooted. The visible upper arm bends too.
    free=catmull(paths[side][1:],12)
    cumulative=[0.]
    for a,b in zip(free,free[1:]):cumulative.append(cumulative[-1]+(Vector(b)-Vector(a)).length)
    rig_path=[paths[side][0],(Vector(paths[side][0])+Vector(paths[side][1]))*.5,paths[side][1]]
    for j in range(1,13):
        station=cumulative[-1]*j/12
        k=next((k for k in range(len(free)-1) if cumulative[k+1]>=station),len(free)-2)
        rig_path.append(Vector(free[k]).lerp(Vector(free[k+1]),(station-cumulative[k])/(cumulative[k+1]-cumulative[k])))
    for j in range(len(rig_path)-1):
        name=f'arm{j+1:02}.{side}';bone(name,rig_path[j],rig_path[j+1],prev);prev=name
    bone('hand.'+side,paths[side][-1],hand_tips[side],prev)
    for name,pts in digit_paths.items():
        if not name.endswith(side):continue
        base=name.split('.')[0]
        bone(f'{base}01.{side}',pts[0],pts[1],'hand.'+side)
        bone(f'{base}02.{side}',pts[1],pts[2],f'{base}01.{side}')
    lp=leg_paths[side]
    bone('thigh.'+side,lp[0],lp[2],'pelvis')
    bone('shin.'+side,lp[2],lp[3],'thigh.'+side)
    bone('foot.'+side,lp[3],(sign*.46,-.25,.075),'shin.'+side)
    for name,pts in toes.items():
        if name.endswith(side):bone(name,pts[0],pts[1],'foot.'+side)
    bone('CTRL_hand.'+side,paths[side][-1],Vector(paths[side][-1])+Vector((0,0,.2)),'root',False)
    bone('CTRL_foot.'+side,lp[3],Vector(lp[3])+Vector((0,0,.2)),'root',False)
    bone('POLE_knee.'+side,(sign*.5,-1,.5),(sign*.5,-1,.7),'root',False)
    bone('grip'+('Left' if side=='L' else 'Right'),grips[side],Vector(grips[side])+hand_normals[side]*.06,'hand.'+side,False)
    bone('footContact'+('Left' if side=='L' else 'Right'),(sign*.46,-.18,.026),(sign*.46,-.28,.026),'foot.'+side,False)
    bone('eye.'+side,(sign*.195,-.226,2.89),(sign*.195,-.37,2.89),'head',False)
bone('mouth',(0,-.284,2.69),(0,-.39,2.69),'head',False)
bone('headTouch',(0,0,3.2),(0,0,3.3),'head',False)
bpy.ops.object.mode_set(mode='OBJECT')
rig.show_in_front=True
for b in ad.bones:
    collection='Controls' if b.name.startswith(('CTRL','POLE')) or b.name=='root' else 'Deform' if b.use_deform else 'Contact anchors'
    coll=ad.collections.get(collection) or ad.collections.new(collection);coll.assign(b)
    b.bbone_segments=1
    if b.name.startswith(('arm','hand')):
        side=b.name[-1];sign=1 if side=='L' else -1
        portion=1. if b.name.startswith('hand') else max(0,(int(b.name[3:5])-2)/12)
        a=math.radians(48)*portion
        b['surface_normal']=[-sign*math.sin(a),-math.cos(a),0]
for pb in rig.pose.bones:pb.rotation_mode='QUATERNION'
# Heat weighting uses the separated armpits; no body-to-wrist sheets exist.
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for mod in body.modifiers:
    if mod.type=='ARMATURE':mod.use_deform_preserve_volume=True
# Remove negligible influences; keep exactly normalized glTF skin weights.
bpy.context.view_layer.objects.active=body
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
body['continuous_surface']=True
body['rest_pose']='Standing; inward palms, short curled digits, continuous rounded wrist and shoulder'
body['hand_design']='Thick palm, three short webbed fingers and opposing thumb; reference 2026-11-28'
# Local expression shapes.
body.shape_key_add(name='Basis')
for name,side in [('CheekPuff.L',1),('CheekPuff.R',-1)]:
    key=body.shape_key_add(name=name)
    for v in body.data.vertices:
        x,y,z=v.co
        influence=math.exp(-((x-side*.215)/.13)**2-((z-2.68)/.13)**2)*smooth(-.09,-.23,y)
        key.data[v.index].co.y-=.065*influence
        key.data[v.index].co.x+=side*.026*influence
key=body.shape_key_add(name='Breathe')
for v in body.data.vertices:
    x,y,z=v.co;w=math.exp(-((z-1.5)/.58)**2)*(1-smooth(.65,.82,abs(x)))
    key.data[v.index].co.y+=y*.018*w
    key.data[v.index].co.x+=x*.009*w

def bind(ob,bonename):
    ob.parent=rig
    group=ob.vertex_groups.new(name=bonename);group.add(list(range(len(ob.data.vertices))),1,'REPLACE')
    mod=ob.modifiers.new('Skeleton','ARMATURE');mod.object=rig

def oval(name,center,scale,mat,bone_name):
    v=[];f=[];ellipsoid(center,scale,v,f,32,20)
    ob=mesh(name,v,f);ob.data.materials.append(mat);bind(ob,bone_name);return ob
for side,sign in [('L',1),('R',-1)]:
    center=(sign*.195,-.226,2.89)
    oval('Eye.'+side,center,(.092,.037,.119),iris,'eye.'+side)
    oval('Pupil.'+side,(sign*.195,-.258,2.892),(.052,.018,.069),black,'eye.'+side)
# Smile is an inset narrow tapered curve with closed tips.
pts=[];rs=[]
for i in range(33):
    t=-1+2*i/32
    pts.append((t*.145,-.281-.017*(1-t*t),2.69+.024*t*t))
    rs.append(.001+.006*(math.sin(math.pi*i/32)**.5))
v=[];f=[];tube(pts,rs,v,f,8);mouth=mesh('Mouth',v,f);mouth.data.materials.append(mouthmat);bind(mouth,'head')
mouth.shape_key_add(name='Basis');key=mouth.shape_key_add(name='Frown')
for p in key.data:p.co.z-=.045*(abs(p.co.x)/.145)**2
# Eyelids physically cover the eyeballs. Neutral lids sit on the outer rim.
lids=[]
for side,sign in [('L',1),('R',-1)]:
    for upper in [True,False]:
        def lidcoords(closed=False,angry=False):
            result=[]
            for j in range(9):
                v=j/8
                for i in range(25):
                    u=-1+2*i/24;rim=math.sqrt(max(0,1-u*u))
                    outer=(1 if upper else -1)*rim
                    edge=outer*.995
                    if closed:edge=0
                    if angry:
                        edge=(.38+.27*sign*u)*rim if upper else -rim*.89
                    zz=outer+(edge-outer)*v
                    depth=math.sqrt(max(0,1-u*u-zz*zz))
                    result.append((sign*.195+u*.095,-.226-.055*depth-.003-.008*v,2.89+zz*.122))
            return result
        vs=lidcoords();fs=[]
        for j in range(8):
            for i in range(24):
                a=j*25+i;fs.append((a,a+1,a+26,a+25))
        ob=mesh(('UpperLid.' if upper else 'LowerLid.')+side,vs,fs)
        lidmat=material('Naiwa | lid '+str(upper)+side,(1,.59,.012),.55)
        ob.data.materials.append(lidmat);bind(ob,'head');ob.shape_key_add(name='Basis')
        for name,coords in [('Blink',lidcoords(True)),('Angry',lidcoords(False,True))]:
            key=ob.shape_key_add(name=name)
            for p,co in zip(key.data,coords):p.co=co
        lids.append(ob)
# Attached saliva with retractable strand and small bead.
v=[];f=[]
droolpath=[(.125,-.30,2.70),(.13,-.318,2.63),(.134,-.32,2.55),(.13,-.32,2.49)]
tube(droolpath,[.005,.004,.004,.008],v,f,10);ellipsoid(droolpath[-1],(.014,.012,.024),v,f,16,10)
drool=mesh('Naiwa_Drool',v,f);drool.data.materials.append(saliva);bind(drool,'head')
full=[p.co.copy() for p in drool.data.vertices]
for p in drool.data.vertices:p.co=Vector((.125,-.276,2.70))+(p.co-Vector(droolpath[0]))*.001
drool.shape_key_add(name='Basis');key=drool.shape_key_add(name='Drool')
for p,co in zip(key.data,full):p.co=co
# Optional IK controls; demo clips are FK and export without constraint baking.
for side in ['L','R']:
    for name,last,count,target in [('arm','arm14',14,'hand'),('leg','shin',2,'foot')]:
        prop='IK_'+name+'_'+side;rig[prop]=0.;rig.id_properties_ui(prop).update(min=0,max=1,description='0 = authored FK, 1 = move matching CTRL bone')
        c=rig.pose.bones[last+'.'+side].constraints.new('IK');c.name='Optional '+name+' IK';c.target=rig;c.subtarget='CTRL_'+target+'.'+side;c.chain_count=count;c.use_stretch=(name=='arm')
        if name=='leg':c.pole_target=rig;c.pole_subtarget='POLE_knee.'+side;c.pole_angle=-math.pi/2
        driver=c.driver_add('influence').driver;driver.expression='weight'
        var=driver.variables.new();var.name='weight';var.type='SINGLE_PROP';var.targets[0].id=rig;var.targets[0].data_path='["'+prop+'"]'
rig['authoring_notes']='Fourteen segment soft arms; FK clips; optional hand and foot IK. Fingers and eyes individually poseable. Z up, front -Y.'
# Studio setup.
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.fps=30
scene.view_settings.view_transform='Khronos PBR Neutral'
world=bpy.data.worlds.new('Naiwa studio world');world.use_nodes=True;scene.world=world
bg=next(n for n in world.node_tree.nodes if n.type=='BACKGROUND');bg.inputs['Color'].default_value=(.85,.87,.89,1);bg.inputs['Strength'].default_value=.55
floor=mesh('Naiwa_Floor',[(-200,-200,-.003),(200,-200,-.003),(200,200,-.003),(-200,200,-.003)],[(0,1,2,3)],studio);floor.data.materials.append(material('Naiwa | studio floor',(.88,.89,.875),.8))
def aim(ob,at):ob.rotation_euler=(Vector(at)-ob.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Naiwa_Camera');camera=bpy.data.objects.new('Naiwa_Camera',camdata);studio.objects.link(camera);camera.location=(0,-9,1.52);camdata.type='ORTHO';camdata.ortho_scale=3.55;aim(camera,(0,0,1.52));scene.camera=camera
for name,loc,power,size in [('Key',(-3,-4,6),450,4),('Fill',(4,-2,4),180,3),('Rim',(1,3,5),300,3)]:
    data=bpy.data.lights.new('Naiwa_'+name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    ob=bpy.data.objects.new('Naiwa_'+name,data);studio.objects.link(ob);ob.location=loc;aim(ob,(0,0,1.6))
scene['body_vertices']=len(body.data.vertices)
scene['body_triangles']=sum(len(p.vertices)-2 for p in body.data.polygons)
scene['armature_bones']=len(ad.bones)
scene.frame_set(1)
print('Naiwa geometry rebuilt:',len(body.data.vertices),'vertices;',len(ad.bones),'bones')

for ob in scene.objects:
    if ob.type=='MESH' and ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:key.value=0

# Match the reference's short continuous neck. Transform every
# bind-space feature together so eyes, eyelids and contact bones remain aligned.
ground_offset=min(v.co.z for v in body.data.vertices)
def reference_proportion(p):
    x,y,z=p
    upper=smooth(2.18,2.65,z)
    return Vector((x,y,(2.18+(z-2.18)*.84 if z>2.18 else z)-ground_offset))
for ob in character.objects:
    if ob.type!='MESH':continue
    if ob.data.shape_keys:
        for key in ob.data.shape_keys.key_blocks:
            for p in key.data:p.co=reference_proportion(p.co)
    else:
        for p in ob.data.vertices:p.co=reference_proportion(p.co)
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
for b in rig.data.edit_bones:
    b.head=reference_proportion(b.head);b.tail=reference_proportion(b.tail)
bpy.ops.object.mode_set(mode='OBJECT')
scene.render.use_compositing=False;scene.render.use_sequencer=False
