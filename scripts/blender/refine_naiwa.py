"""Bound limb weights, expression defaults and preview surface polish."""
import bpy, math
from mathutils import Vector
scene=bpy.data.scenes['DIYCat_Naiwa_Studio'];bpy.context.window.scene=scene;rig=scene.objects['Naiwa_Rig'];body=scene.objects['Naiwa_Surface']
for b in rig.data.bones:
    if b.name.startswith('eye.'):b.use_deform=True

def smooth(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a)));return t*t*(3-2*t)
def distance(p,a,b):
    t=max(0.,min(1.,(p-a).dot(b-a)/(b-a).length_squared))
    return (p-a-t*(b-a)).length
bones={b.name:(b.head_local.copy(),b.tail_local.copy()) for b in rig.data.bones if b.use_deform}
trunk=['pelvis','spine','chest','neck','head']
def nearest(p,names,sharp=2.):
    pairs=sorted([(distance(p,*bones[n]),n) for n in names])[:3]
    ws=[(n,1/(d+.14)**sharp) for d,n in pairs];total=sum(w for n,w in ws)
    return {n:w/total for n,w in ws}
def arm_weights(p, side):
    names=sorted(n for n in bones if n.startswith('arm') and n.endswith('.'+side))+['hand.'+side]
    lengths=[(bones[n][1]-bones[n][0]).length for n in names]
    starts=[sum(lengths[:i]) for i in range(len(names))]
    stations=[starts[i]+lengths[i]*.5 for i in range(len(names))]
    best=(1e9,0.)
    for n,l,s in zip(names,lengths,starts):
        a,b=bones[n];u=max(0.,min(1.,(p-a).dot(b-a)/(l*l)))
        d=(p-a-(b-a)*u).length_squared
        if d<best[0]:best=(d,s+u*l)
    position=best[1]
    if position>=stations[-1]:
        digits=[n for n in bones if n.endswith('.'+side) and n.startswith(('finger','thumb'))]
        a,b=bones['hand.'+side]
        along=(p-a).dot((b-a).normalized())
        mix=smooth(.075,.18,along)
        ws={names[-1]:1-mix}
        for n,w in nearest(p,digits,3.).items():ws[n]=w*mix
        return ws
    # Overlapping influences keep the soft arm from showing hard joints.
    samples=[('clavicle.'+side,-.10)]+list(zip(names,stations))
    pairs=sorted([(math.exp(-((position-station)/.11)**2),n) for n,station in samples],reverse=True)[:3]
    total=sum(w for w,n in pairs)
    return {n:w/total for w,n in pairs}

for mod in body.modifiers:
    if mod.type=='ARMATURE':mod.use_deform_preserve_volume=False
for group in list(body.vertex_groups):body.vertex_groups.remove(group)
groups={n:body.vertex_groups.new(name=n) for n in bones}
# Below the shoulder seam the arm is a separate cross-section. Classify by
# connected topology, never by height alone (fingers extend as low as the hips).
adjacency=[[] for v in body.data.vertices]
for e in body.data.edges:
    a,b=e.vertices;adjacency[a].append(b);adjacency[b].append(a)
arm_regions={};arm_cuts={}
for side,sign in [('L',1),('R',-1)]:
    seed=min((v for v in body.data.vertices if sign*v.co.x>.65 and .73<v.co.z<1.12),key=lambda v:v.co.z).index
    for cut in [1.95,1.90,1.85,1.80,1.75,1.70,1.65,1.60,1.55]:
        region={seed};stack=[seed]
        while stack:
            a=stack.pop()
            for b in adjacency[a]:
                if b not in region and body.data.vertices[b].co.z<cut:
                    region.add(b);stack.append(b)
        if all(sign*body.data.vertices[i].co.x>.55 for i in region):break
    assert all(sign*body.data.vertices[i].co.x>.55 for i in region), 'Armpit clearance is insufficient'
    arm_regions[side]=region;arm_cuts[side]=cut
    print('Arm topology',side,'split at',cut,'vertices',len(region))
profile=[(1.83,.62,.51,.005),(2.04,.52,.43,.025),(2.21,.425,.355,.035),(2.36,.375,.31,.025),(2.52,.345,.29,.01),(2.70,.326,.28,0)]
for vertex in body.data.vertices:
    p=vertex.co;x,y,z=p;ax=abs(x);side='L' if x>0 else 'R'
    arm=[n for n in bones if n.endswith('.'+side) and n.startswith(('clavicle','arm','hand','finger','thumb'))]
    leg=[n for n in bones if n.endswith('.'+side) and n.startswith(('thigh','shin','foot','toe'))]
    # In the bind pose, forearms have their own volume clear of the torso.
    cut=arm_cuts[side]
    # Compare the surface against the original trunk cross-section. A radial
    # mask around the arm centre incorrectly leaves its outer skin behind.
    lo,hi=next(((a,b) for a,b in zip(profile,profile[1:]) if z<=b[0]),(profile[-2],profile[-1]))
    u=max(0.,min(1.,(z-lo[0])/(hi[0]-lo[0])))
    rx,ry,cy=[lo[k]+(hi[k]-lo[k])*u for k in (1,2,3)]
    trunk_radius=math.sqrt((ax/rx)**2+((y-cy)/ry)**2)
    armweight=smooth(.98,1.20,trunk_radius)*(1-smooth(2.38,2.52,z))
    if z<cut:
        topology_weight=1. if vertex.index in arm_regions[side] else 0.
        blend=smooth(cut-.05,cut,z)
        armweight=topology_weight*(1-blend)+armweight*blend
    legweight=(1-smooth(.74,.98,z))*smooth(.12,.27,ax)*(1-armweight)
    ws={}
    for subset,weight in [(trunk,1-armweight-legweight),(arm,armweight),(leg,legweight)]:
        if weight<.0001:continue
        weights=arm_weights(p,side) if subset is arm else nearest(p,subset)
        for n,w in weights.items():ws[n]=ws.get(n,0)+w*weight
    ws=sorted(ws.items(),key=lambda x:x[1],reverse=True)[:4];total=sum(w for n,w in ws)
    for n,w in ws:groups[n].add([vertex.index],w/total,'REPLACE')
print('Bound weights: torso isolated from forearms, hips limited below abdomen; eye bones enabled.')
scene.frame_set(30);bpy.context.view_layer.update()

# Relax weights over connected edges, then renormalize to four influences.
bpy.ops.object.select_all(action='DESELECT');body.select_set(True);bpy.context.view_layer.objects.active=body
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_smooth(group_select_mode='ALL',factor=.65,repeat=12)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.vertex_group_limit_total(limit=4)
bpy.ops.object.vertex_group_normalize_all(lock_active=False)
