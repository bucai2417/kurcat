"""Author named, loopable FK clips for create_naiwa.py's rig, plus expression tracks."""
import bpy, math, json
from mathutils import Vector, Matrix, Quaternion
scene=bpy.data.scenes['DIYCat_Naiwa_Studio'];bpy.context.window.scene=scene
rig=scene.objects['Naiwa_Rig'];body=scene.objects['Naiwa_Surface']
# Parent matrices must evaluate in pose mode, even when the cached source is at rest.
rig.data.pose_position='POSE'
for b in rig.data.bones:b.inherit_scale='NONE'
scene.timeline_markers.clear()
shape_objects=[o for o in scene.objects if o.type=='MESH' and o.data.shape_keys]

def smooth(a,b,x):
    t=max(0.,min(1.,(x-a)/(b-a)));return t*t*(3-2*t)
def bezier(a,b,c,d,t):
    return (1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d

def arm_frame(direction, normal):
    y=direction.normalized()
    z=(normal-y*normal.dot(y)).normalized()
    x=y.cross(z).normalized()
    return Matrix((x,y,z)).transposed()

def setbone(name,a,b,normal=None):
    pb=rig.pose.bones[name];rest=rig.data.bones[name];a=Vector(a);b=Vector(b)
    if normal is None:
        q=(rest.tail_local-rest.head_local).rotation_difference(b-a) @ rest.matrix_local.to_quaternion()
    else:
        source=arm_frame(rest.tail_local-rest.head_local,Vector(rest.get('surface_normal',(0,-1,0))))
        target=arm_frame(b-a,normal)
        q=(target @ source.transposed() @ rest.matrix_local.to_3x3()).to_quaternion()
    mat=q.to_matrix().to_4x4() @ Matrix.Diagonal((1,(b-a).length/rest.length,1,1))
    mat.translation=a;pb.matrix=mat
    bpy.context.view_layer.update()

def shape(ob,name,value):ob.data.shape_keys.key_blocks[name].value=value

def pose(kind,t,duration):
    for pb in rig.pose.bones:pb.matrix_basis=Matrix.Identity(4)
    for ob in shape_objects:
        for key in ob.data.shape_keys.key_blocks:key.value=0
    # The reference gesture stands with planted feet; desktop clips stay seated.
    standing=kind=='delight'
    gather=smooth(.3,1.5,t)*(1-smooth(duration-1.5,duration-.2,t)) if standing else 0
    reach=smooth(2.5,3.9,t)*(1-smooth(5.0,6.4,t)) if standing else 0
    body_bob=.035*gather*(1-math.cos(2*math.pi*t/duration)) if standing else 0
    pb=rig.pose.bones['pelvis'];mat=pb.bone.matrix_local.copy();mat.translation.z-=body_bob if standing else .62;pb.matrix=mat
    breath=.5+.5*math.sin(2*math.pi*t/duration)
    sway=0
    if kind=='sway':sway=.065*math.sin(2*math.pi*t/duration)
    if kind=='idle':sway=.018*math.sin(2*math.pi*t/duration)
    if kind=='wave':sway=-.035*math.sin(math.pi*t/duration)**2
    if standing:sway=.035*math.sin(2*math.pi*t/duration)*gather
    settle=1.2 if kind=='wave' else .8
    release=1.2 if kind=='wave' else .9
    envelope=smooth(0,settle,t)*(1-smooth(duration-release,duration,t))
    sleep=envelope if kind=='nap' else 0
    anger=envelope if kind=='angry' else 0
    for name,angle in [('spine',sway),('chest',sway*.3),('neck',sway*.2)]:
        rig.pose.bones[name].rotation_quaternion=Vector((0,0,1)).rotation_difference(Vector((math.sin(angle),0,math.cos(angle))))
    # Head bows a little, rather than stretching the entire face downward.
    rig.pose.bones['head'].rotation_quaternion=Quaternion((1,0,0),.075*sleep+.055*gather*(1-reach)+.009*math.sin(2*math.pi*t/duration))
    if kind=='wave':
        rig.pose.bones['head'].rotation_quaternion @= Quaternion((0,1,0),-.075*envelope)
        rig.pose.bones['clavicle.L'].rotation_quaternion=Quaternion((0,1,0),-.09*envelope)
    if standing:
        rig.pose.bones['chest'].rotation_quaternion @= Quaternion((1,0,0),.045*gather*(1-reach))
        for side,sign in [('L',1),('R',-1)]:
            rig.pose.bones['clavicle.'+side].rotation_quaternion=Quaternion((0,1,0),-sign*.23*reach)
    bpy.context.view_layer.update()
    for side,sign in [('L',1),('R',-1)]:
        # Keep the embedded shoulder bones aligned with the torso.
        # The free arm begins outside the body, so reaching cannot drag the belly.
        shoulder=rig.pose.bones['arm02.'+side].tail.copy()
        arm_names=sorted(b.name for b in rig.data.bones if b.name.startswith('arm') and b.name.endswith('.'+side) and int(b.name[3:5])>=3)
        segment_count=len(arm_names)
        press=0
        if kind=='typing':press=max(0,math.sin(2*math.pi*t*3+(0 if side=='L' else math.pi)))*envelope
        hand=Vector((sign*.43,-.86,.565-.027*press))
        palm_direction=Vector((0,-1,-.10)).normalized()
        palm_normal=Vector((0,0,-1))
        if kind=='mouse' and side=='R':
            hand=hand.lerp(Vector((-.98-.025*math.sin(2*math.pi*t/duration),-.83,.575-.009*max(0,math.sin(2*math.pi*t*2))*envelope)),envelope)
        if kind=='wave' and side=='L':
            hand=hand.lerp(Vector((1.18+.085*math.sin(t*math.pi*2),-.39,1.96+.025*math.sin(t*math.pi*2))),envelope)
        if kind=='nap':hand.y+=.04*sleep
        if kind=='angry':hand.z+=.055*anger*abs(math.sin(t*math.pi*3))
        hand.x+=sway*.25
        c1=shoulder+Vector((sign*.10,-.12,-.34))
        c2=hand+Vector((sign*.13,.23,.16))
        if kind=='wave' and side=='L':
            c1=c1.lerp(shoulder+Vector((sign*.30,-.015,-.10)),envelope)
            c2=c2.lerp(hand+Vector((sign*.24,.06,-.32)),envelope)
            turn=Quaternion((1,0,0),-1.61*envelope)
            palm_direction=turn @ palm_direction;palm_normal=turn @ palm_normal
        if standing:
            rest=rig.data.bones['hand.'+side]
            rest_direction=(rest.tail_local-rest.head_local).normalized()
            rest_normal=Vector(rest['surface_normal'])
            hand=rest.head_local.lerp(Vector((sign*.29,-.62,1.55-body_bob)),gather)
            hand=hand.lerp(Vector((sign*.35,-.12,3.045-body_bob)),reach)
            palm_direction=rest_direction.lerp(Vector((-sign,.05,-.10)).normalized(),gather).normalized()
            palm_direction=palm_direction.lerp(Vector((-sign,.10,.05)).normalized(),reach).normalized()
            palm_normal=rest_normal.lerp(Vector((0,1,0)),gather).normalized()
            palm_normal=palm_normal.lerp(Vector((0,0,-1)),reach).normalized()
            c1=shoulder+Vector((sign*.40,-.35,-.30))
            c2=hand+Vector((sign*.65,-.10,-.27))
            c1=c1.lerp(shoulder+Vector((sign*.35,-.12,.05)),reach)
            c2=c2.lerp(hand+Vector((sign*.45,-.05,-.40)),reach)
            # At each end return to the actual hanging bind curve.
            rest_c1=shoulder+Vector((sign*.18,-.07,-.25))
            rest_c2=hand+Vector((sign*.04,.04,.18))
            c1=rest_c1.lerp(c1,gather);c2=rest_c2.lerp(c2,gather)
        # The wrist tangent MUST follow the palm, including standing gestures.
        # A sideways handle followed by an upright palm creates a visible hinge.
        handle=max(.18,min(.42,(hand-shoulder).length*.29))
        c2=hand-palm_direction*handle
        # Preserve each segment's share of the arm length along the curve.
        # Equal parameter intervals squash the long shoulder bone into a lump.
        samples=[bezier(shoulder,c1,c2,hand,j/72) for j in range(73)]
        cumulative=[0.]
        for j in range(72):cumulative.append(cumulative[-1]+(samples[j+1]-samples[j]).length)
        lengths=[rig.data.bones[name].length for name in arm_names]
        curve=[shoulder]
        for j in range(1,segment_count):
            target=cumulative[-1]*sum(lengths[:j])/sum(lengths)
            k=next(k for k in range(72) if cumulative[k+1]>=target)
            curve.append(samples[k].lerp(samples[k+1],(target-cumulative[k])/(cumulative[k+1]-cumulative[k])))
        curve.append(hand)
        # Match the last finite bone to the analytic tangent, not just the curve endpoint.
        curve[-2]=hand-palm_direction*(hand-curve[-2]).length
        # Transport a frame along the soft arm, then spread palm pronation
        # across the entire forearm. A rotated wrist alone pinches the skin.
        directions=[(curve[j+1]-curve[j]).normalized() for j in range(segment_count)]
        normal=Vector(rig.data.bones[arm_names[0]].get('surface_normal',(0,-1,0)))
        normal=(normal-directions[0]*normal.dot(directions[0])).normalized()
        normals=[normal]
        for j in range(1,segment_count):normals.append(directions[j-1].rotation_difference(directions[j]) @ normals[-1])
        transported=directions[-1].rotation_difference(palm_direction) @ normals[-1]
        desired=(palm_normal-palm_direction*palm_normal.dot(palm_direction)).normalized()
        twist=math.atan2(palm_direction.dot(transported.cross(desired)),transported.dot(desired))
        # The +/- pi representation is arbitrary. Keep a continuous roll branch.
        cache_key=side
        old=roll_history.get(cache_key,twist)
        while twist-old>math.pi:twist-=2*math.pi
        while twist-old<-math.pi:twist+=2*math.pi
        roll_history[cache_key]=twist
        for j in range(segment_count):
            normal=Quaternion(directions[j],twist*smooth(0,1,(j+1)/segment_count)) @ normals[j]
            setbone(arm_names[j],curve[j],curve[j+1],normal)
        setbone('hand.'+side,hand,hand+palm_direction*rig.data.bones['hand.'+side].length,desired)
        assert directions[-1].dot(palm_direction)>.9999, 'Wrist tangent must be continuous'
        chain=arm_names+['hand.'+side]
        for left,right in zip(chain,chain[1:]):
            assert (rig.pose.bones[left].tail-rig.pose.bones[right].head).length<.002, f'Disconnected arm: {left} -> {right}'
        for digit in ['finger1','finger2','finger3','thumb']:
            # Curl toward the palm in its own bind plane, independent of camera.
            pb=rig.pose.bones[digit+'02.'+side];rest=pb.bone
            direction=(rest.tail_local-rest.head_local).normalized()
            axis=direction.cross(Vector(rig.data.bones['hand.'+side]['surface_normal'])).normalized()
            local_axis=rest.matrix_local.to_quaternion().inverted() @ axis
            curl=press*.14 if digit!='thumb' else 0
            finger_phase={'finger1':0.,'finger2':.32,'finger3':.64,'thumb':.9}[digit]
            if kind=='wave' and side=='L':
                curl+=envelope*(.045+.045*math.sin(t*math.pi*2-finger_phase))
            if kind=='idle':
                curl+=.025*math.sin(math.pi*t/duration)**2*(1+math.sin(2*math.pi*t/duration-finger_phase))
            if kind=='nap':curl+=.07*sleep
            pb.rotation_quaternion=Quaternion(local_axis,curl)
        # Seated hips turn outward, leaving the belly smooth and feet grounded.
        hip=rig.pose.bones['pelvis'].matrix @ rig.data.bones['pelvis'].matrix_local.inverted() @ rig.data.bones['thigh.'+side].head_local
        knee=Vector((sign*.56,-.28,.20));ankle=Vector((sign*.61,-.53,.12))
        if standing:
            knee=rig.data.bones['thigh.'+side].tail_local.copy()+Vector((sign*.015*gather,-body_bob,0))
            ankle=rig.data.bones['shin.'+side].tail_local.copy()
        if kind=='angry':
            lift=.09*anger*max(0,math.sin(t*math.pi*4+(0 if side=='L' else math.pi)))
            ankle.z+=lift;knee.z+=lift*.55
        setbone('thigh.'+side,hip,knee);setbone('shin.'+side,knee,ankle)
        foot_end=rig.data.bones['foot.'+side].tail_local if standing else ankle+Vector((0,-.225,-.085))
        setbone('foot.'+side,ankle,foot_end)
        for ctrl,target in [('hand',hand),('foot',ankle)]:
            b=rig.pose.bones['CTRL_'+ctrl+'.'+side];m=b.bone.matrix_local.copy();m.translation=target;b.matrix=m
    shape(body,'Breathe',breath)
    shape(body,'CheekPuff.L',anger*.8);shape(body,'CheekPuff.R',anger*.7)
    shape(scene.objects['Mouth'],'Frown',anger*.7)
    blink=math.exp(-((t-duration*.55)/.075)**2)
    for ob in shape_objects:
        if 'Lid.' in ob.name:
            shape(ob,'Blink',max(sleep,blink)*(1-anger*.7));shape(ob,'Angry',anger*.8)
    shape(scene.objects['Naiwa_Drool'],'Drool',sleep*smooth(1.5,2.4,t)*(1-smooth(duration-1.4,duration-1.,t)))
    bpy.context.view_layer.update()

# Only bone transforms are needed while baking; avoid reevaluating dense skin
# for every individual joint. Restore viewport visibility after authoring.
mesh_visibility={o:o.hide_viewport for o in scene.objects if o.type=='MESH'}
for ob in mesh_visibility:ob.hide_viewport=True
clips=[('idle',4),('typing',3),('mouse',3),('sway',5),('wave',4),('nap',6),('angry',3),('delight',8)]
owners=[rig]+[o.data.shape_keys for o in shape_objects]
for owner in owners:owner.animation_data_clear();owner.animation_data_create()
start=1;ranges=[]
for name,seconds in clips:
    end=start+seconds*30
    actions=[]
    for owner in owners:
        action=bpy.data.actions.new('Naiwa_'+name+'__'+owner.name);owner.animation_data.action=action;actions.append((owner,action))
    # Sample every second frame; baked ordinary transforms work without Blender constraints.
    previous={};roll_history={}
    for frame in list(range(start,end,2))+[end]:
        scene.frame_set(frame);pose(name,(frame-start)/30,seconds)
        for pb in rig.pose.bones:
            if pb.name in previous and pb.rotation_quaternion.dot(previous[pb.name])<0:pb.rotation_quaternion.negate()
            previous[pb.name]=pb.rotation_quaternion.copy()
            for prop in ['location','rotation_quaternion','scale']:pb.keyframe_insert(data_path=prop,frame=frame,group=pb.name)
        for ob in shape_objects:
            for key in ob.data.shape_keys.key_blocks:
                if key.name!='Basis':key.keyframe_insert('value',frame=frame)
    for owner,action in actions:
        # Identical track names group the rig and all expression tracks into one GLB clip.
        slot=owner.animation_data.action_slot
        owner.animation_data.action=None
        track=owner.animation_data.nla_tracks.new();track.name=name
        strip=track.strips.new(name,start,action);strip.action_slot=slot;strip.extrapolation='NOTHING'
    ranges.append({'name':name,'start':start,'end':end,'seconds':seconds})
    scene.timeline_markers.new(name,frame=start)
    start=end+1
scene.frame_start=1;scene.frame_end=start-1;scene['clip_ranges']=json.dumps(ranges)
scene.frame_set(1)
# Reset values left by the final authored action so the first NLA evaluates cleanly.
bpy.context.view_layer.update()
print('Authored clips',ranges)

for ob,hidden in mesh_visibility.items():ob.hide_viewport=hidden
bpy.context.view_layer.update()
