"""Author named, loopable FK clips for create_naiwa.py's rig, plus expression tracks."""
import bpy, math, json
from mathutils import Vector, Matrix, Quaternion
scene=bpy.data.scenes['DIYCat_Naiwa_Studio'];bpy.context.window.scene=scene
rig=scene.objects['Naiwa_Rig'];body=scene.objects['Naiwa_Surface']
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
        source=arm_frame(rest.tail_local-rest.head_local,Vector((0,-1,0)))
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
    # Move the pelvis down to a seated pose. Root and foot contacts stay fixed.
    pb=rig.pose.bones['pelvis'];mat=pb.bone.matrix_local.copy();mat.translation.z-=.62;pb.matrix=mat
    breath=.5+.5*math.sin(2*math.pi*t/duration)
    sway=0
    if kind=='sway':sway=.065*math.sin(2*math.pi*t/duration)
    if kind=='idle':sway=.009*math.sin(2*math.pi*t/duration)
    settle=1.2 if kind=='wave' else .8
    release=1.2 if kind=='wave' else .9
    envelope=smooth(0,settle,t)*(1-smooth(duration-release,duration,t))
    sleep=envelope if kind=='nap' else 0
    anger=envelope if kind=='angry' else 0
    for name,angle in [('spine',sway),('chest',sway*.3),('neck',sway*.2)]:
        rig.pose.bones[name].rotation_quaternion=Vector((0,0,1)).rotation_difference(Vector((math.sin(angle),0,math.cos(angle))))
    # Head bows a little, rather than stretching the entire face downward.
    rig.pose.bones['head'].rotation_quaternion=Quaternion((1,0,0),.075*sleep)
    bpy.context.view_layer.update()
    for side,sign in [('L',1),('R',-1)]:
        # Keep the embedded shoulder bones aligned with the torso.
        # The free arm begins outside the body, so reaching cannot drag the belly.
        shoulder=rig.pose.bones['arm02.'+side].tail.copy()
        press=0
        if kind=='typing':press=max(0,math.sin(2*math.pi*t*3+(0 if side=='L' else math.pi)))*envelope
        hand=Vector((sign*.43,-.86,.54-.035*press))
        if kind=='mouse' and side=='R':
            hand=hand.lerp(Vector((-.98-.035*math.sin(2*math.pi*t/duration),-.83,.52-.018*max(0,math.sin(2*math.pi*t*2))*envelope)),envelope)
        if kind=='wave' and side=='L':
            hand=hand.lerp(Vector((1.30+.07*math.sin(t*math.pi*3),-.32,2.10)),envelope)
        if kind=='nap':hand.y+=.04*sleep
        if kind=='angry':hand.z+=.055*anger*abs(math.sin(t*math.pi*3))
        hand.x+=sway*.25
        c1=shoulder+Vector((sign*.10,-.12,-.34))
        c2=hand+Vector((sign*.13,.23,.16))
        if kind=='wave' and side=='L':
            c1=c1.lerp(shoulder+Vector((sign*.30,-.015,-.10)),envelope)
            c2=c2.lerp(hand+Vector((sign*.24,.06,-.32)),envelope)
        # Preserve each segment's share of the arm length along the curve.
        # Equal parameter intervals squash the long shoulder bone into a lump.
        samples=[bezier(shoulder,c1,c2,hand,j/72) for j in range(73)]
        cumulative=[0.]
        for j in range(72):cumulative.append(cumulative[-1]+(samples[j+1]-samples[j]).length)
        lengths=[rig.data.bones[f'arm{j+1:02}.{side}'].length for j in range(2,6)]
        curve=[shoulder]
        for j in range(1,4):
            target=cumulative[-1]*sum(lengths[:j])/sum(lengths)
            k=next(k for k in range(72) if cumulative[k+1]>=target)
            curve.append(samples[k].lerp(samples[k+1],(target-cumulative[k])/(cumulative[k+1]-cumulative[k])))
        curve.append(hand)
        # Parallel transport carries the palm roll continuously through the soft arm.
        normal=Vector((0,-1,0));previous_direction=(curve[1]-curve[0]).normalized()
        normal=(normal-previous_direction*normal.dot(previous_direction)).normalized()
        for j in range(4):
            direction=(curve[j+1]-curve[j]).normalized()
            normal=previous_direction.rotation_difference(direction) @ normal
            setbone(f'arm{j+3:02}.{side}',curve[j],curve[j+1],normal)
            previous_direction=direction
        direction=Vector((0,-1,-.15)).normalized()*rig.data.bones['hand.'+side].length
        if kind=='wave' and side=='L':
            direction=Quaternion((1,0,0),-1.61*envelope) @ direction
        # Carry the arm's roll into the palm so blended wrist weights cannot
        # twist in opposite directions and collapse the wrist.
        palm_normal=previous_direction.rotation_difference(direction.normalized()) @ normal
        setbone('hand.'+side,hand,hand+direction,palm_normal)
        for digit in ['finger1','finger2','finger3','thumb']:
            p=rig.pose.bones[digit+'02.'+side]
            p.rotation_quaternion=Quaternion((1,0,0),press*.18)
        # Seated hips turn outward, leaving the belly smooth and feet grounded.
        hip=rig.pose.bones['pelvis'].matrix @ rig.data.bones['pelvis'].matrix_local.inverted() @ rig.data.bones['thigh.'+side].head_local
        knee=Vector((sign*.56,-.28,.20));ankle=Vector((sign*.61,-.53,.12))
        if kind=='angry':
            lift=.09*anger*max(0,math.sin(t*math.pi*4+(0 if side=='L' else math.pi)))
            ankle.z+=lift;knee.z+=lift*.55
        setbone('thigh.'+side,hip,knee);setbone('shin.'+side,knee,ankle)
        setbone('foot.'+side,ankle,ankle+Vector((0,-.225,-.085)))
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

clips=[('idle',4),('typing',3),('mouse',3),('sway',5),('wave',4),('nap',6),('angry',3)]
owners=[rig]+[o.data.shape_keys for o in shape_objects]
for owner in owners:owner.animation_data_clear();owner.animation_data_create()
start=1;ranges=[]
for name,seconds in clips:
    end=start+seconds*30
    actions=[]
    for owner in owners:
        action=bpy.data.actions.new('Naiwa_'+name+'__'+owner.name);owner.animation_data.action=action;actions.append((owner,action))
    # Sample every second frame; baked ordinary transforms work without Blender constraints.
    previous={}
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
