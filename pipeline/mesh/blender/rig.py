# PORTED WITH PROVENANCE (spark game-3d-assets WP2): lynx-bench
# ~\ai\lynx-bench\pof3d\round4\characters\work\rig.py, 2026-10-21.
# Changes from the source, and nothing else:
#   - the pose-test renders go to <work>/<name>_pose_<k>.png (the source wrote <work>/tmp/)
#   - glTF export with Draco named OFF
#   - usage unchanged: rig.py -- <finish.blend> <outdir> <name> <work>; fit overrides as JSON in RIGP
# Run: blender -b --factory-startup -P <this file> -- <args>. Blender's print does not reach a
# caller's stdout reliably, so the result is a JSON FILE the caller reads (lib/foundry/mesh/blender.ts).

# UE5-mannequin-named armature fitted to the mesh (hand tips, feet, torso depth measured from vertices) + heat weights computed on a watertight voxel proxy and transferred
# (nearest proxy vertex), then smoothed; per-vertex nearest-bone fallback for anything left unweighted. Exports rigged GLB and pose-test renders.
import bpy,sys,json,time,math,mathutils,numpy as np
from mathutils import Vector,Quaternion,Matrix,kdtree
a=sys.argv[sys.argv.index('--')+1:]; blend,out,name,work=a[:4]
t0=time.time(); R={}
bpy.ops.wm.open_mainfile(filepath=blend)
ob=bpy.data.objects['SM_'+name]
for o in list(bpy.data.objects):
    if o is not ob: bpy.data.objects.remove(o,do_unlink=True)
bpy.context.view_layer.objects.active=ob
me=ob.data
co=np.empty(len(me.vertices)*3); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)
s=1.8/(co[:,2].max()-co[:,2].min()); me.transform(Matrix.Scale(s,4)@Matrix.Translation((0,0,-co[:,2].min()))); me.update()
co=np.empty(len(me.vertices)*3); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)
R['height_m']=round(float(co[:,2].max()-co[:,2].min()),4)
# ---- fit measurements
V=lambda x,y,z: Vector((x,y,z))
yc=float(np.median(co[(co[:,2]>1.0)&(co[:,2]<1.6)][:,1])); yl=float(np.median(co[co[:,2]<0.7][:,1]))
fm=co[co[:,2]<0.15]; xf_l=float(fm[fm[:,0]>0][:,0].mean()) if (fm[:,0]>0).any() else 0.12; xf_r=float(fm[fm[:,0]<0][:,0].mean()) if (fm[:,0]<0).any() else -0.12
import os
P=json.loads(os.environ.get('RIGP','{}')); R['fit_params']=P
sh_z=P.get('sh_z',1.46); sh_x=P.get('sh_x',0.19); nz=P.get('neck_z',1.50)
zone=co[(co[:,2]>0.85)&(co[:,2]<1.55)]
tip={}
for sfx,sg in (('_l',1),('_r',-1)):
    if 'armx' in P:  # hanging arms: lowest vertex outside |x|>armx above zmin
        side=co[(co[:,0]*sg>P['armx'])&(co[:,2]>P.get('arm_zmin',0.5))]; i=int(np.argmin(side[:,2])); tip[sfx]=Vector(side[i])
    else:
        side=zone[zone[:,0]*sg>0]; i=int(np.argmax(side[:,0]*sg)); tip[sfx]=Vector(side[i])
hd=co[(np.abs(co[:,0])<0.12)&(co[:,2]>nz)]; yh=float(np.median(hd[:,1])) if len(hd) else yc
R['fit']={'yc':round(yc,3),'yl':round(yl,3),'foot_x':[round(xf_l,3),round(xf_r,3)],'hand_tip_l':[round(x,3) for x in tip['_l']],'hand_tip_r':[round(x,3) for x in tip['_r']]}
arm=bpy.data.objects.new('Armature',bpy.data.armatures.new('Armature')); bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm; bpy.ops.object.mode_set(mode='EDIT'); E=arm.data.edit_bones
def bone(n,h,t,p=None):
    b=E.new(n); b.head=h; b.tail=t
    if p: b.parent=E[p]
    return b
bone('root',V(0,0,0),V(0,0,0.1))
bone('pelvis',V(0,yc,0.98),V(0,yc,1.05),'root')
bone('spine_01',V(0,yc,1.05),V(0,yc,1.18),'pelvis'); bone('spine_02',V(0,yc,1.18),V(0,yc,1.32),'spine_01'); bone('spine_03',V(0,yc,1.32),V(0,yc,nz),'spine_02')
bone('neck_01',V(0,yc,nz),V(0,yh,nz+0.08),'spine_03'); bone('head',V(0,yh,nz+0.08),V(0,yh,1.80),'neck_01')
for sfx,sg in (('_l',1),('_r',-1)):
    sh=V(sg*sh_x,yc,sh_z); d=tip[sfx]-sh; L=d.length; d=d/L
    # tip lies on y of the hand; keep arm chain in the torso plane y=yc but along the measured x/z direction
    d=V(d.x,0,d.z).normalized()
    el=sh+d*0.46*L; wr=sh+d*0.86*L; hd=sh+d*L
    bone('clavicle'+sfx,V(0,yc,min(1.45,nz-0.05)),sh,'spine_03'); bone('upperarm'+sfx,sh,el,'clavicle'+sfx); bone('lowerarm'+sfx,el,wr,'upperarm'+sfx); bone('hand'+sfx,wr,hd,'lowerarm'+sfx)
    xf=xf_l if sg>0 else xf_r; hx=sg*0.10
    kx=hx+(xf-hx)*(0.93-0.50)/(0.93-0.08)
    bone('thigh'+sfx,V(hx,yl,0.93),V(kx,yl,0.50),'pelvis'); bone('calf'+sfx,V(kx,yl,0.50),V(xf,yl,0.08),'thigh'+sfx); bone('foot'+sfx,V(xf,yl,0.08),V(xf,yl-0.14,0.03),'calf'+sfx)
    bone('ball'+sfx,V(xf,yl-0.14,0.03),V(xf,yl-0.22,0.0),'foot'+sfx)
bpy.ops.object.mode_set(mode='OBJECT')
R['bones']=len(arm.data.bones)
# ---- weights: proxy heat
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active=ob
px=ob.copy(); px.data=ob.data.copy(); px.name='PROXY'; bpy.context.scene.collection.objects.link(px)
px.data.materials.clear()
bpy.ops.object.select_all(action='DESELECT'); px.select_set(True); bpy.context.view_layer.objects.active=px
px.data.remesh_voxel_size=0.016; px.data.remesh_voxel_adaptivity=0.0; bpy.ops.object.voxel_remesh()
R['proxy_tris']=sum(len(p.vertices)-2 for p in px.data.polygons)
bpy.ops.object.select_all(action='DESELECT'); px.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active=arm
t1=time.time(); method='proxy heat (ARMATURE_AUTO on watertight voxel proxy) transferred by nearest proxy vertex'
try: bpy.ops.object.parent_set(type='ARMATURE_AUTO')
except Exception as e: method='ARMATURE_AUTO raised '+str(e)[:100]
R['heat_secs']=round(time.time()-t1,1)
pm=px.data; names=[b.name for b in arm.data.bones]; gi={g.index:g.name for g in px.vertex_groups}
W=np.zeros((len(pm.vertices),len(names)),dtype=np.float32); ni={n:i for i,n in enumerate(names)}
for v in pm.vertices:
    for g in v.groups:
        if gi[g.group] in ni: W[v.index,ni[gi[g.group]]]=g.weight
pw=W.sum(1); R['proxy_zero_weight_verts']=int((pw<1e-6).sum()); R['proxy_verts']=len(pm.vertices)
if R['proxy_zero_weight_verts']>0.05*len(pm.vertices): method='heat failed on proxy -> nearest-bone-segment weights'
kd=kdtree.KDTree(len(pm.vertices)); pco=np.empty(len(pm.vertices)*3); pm.vertices.foreach_get('co',pco); pco=pco.reshape(-1,3)
for i,c in enumerate(pco): kd.insert(c,i)
kd.balance()
for n in names: ob.vertex_groups.new(name=n)
segs=[(n,arm.matrix_world@arm.data.bones[n].head_local,arm.matrix_world@arm.data.bones[n].tail_local) for n in names if n!='root']
def nearest(p):
    best=None;bd=1e9
    for n,h,t in segs:
        d=t-h; L=d.length_squared; u=0 if L==0 else max(0,min(1,(p-h).dot(d)/L)); dist=(p-(h+d*u)).length
        if dist<bd: bd=dist;best=n
    return best
fb=0; use_heat=method.startswith('proxy')
for v in me.vertices:
    done=False
    if use_heat:
        _,pi,_=kd.find(v.co); w=W[pi]
        if w.sum()>1e-6:
            for j in np.nonzero(w)[0]: ob.vertex_groups[names[j]].add([v.index],float(w[j]),'REPLACE')
            done=True
    if not done: fb+=1; ob.vertex_groups[nearest(v.co)].add([v.index],1.0,'REPLACE')
R['nearest_bone_fallback_verts']=fb
bpy.data.objects.remove(px,do_unlink=True)
bpy.context.view_layer.objects.active=ob; ob.select_set(True); bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_smooth(group_select_mode='ALL',factor=0.5,repeat=4,expand=0.0)
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL',limit=4); bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL',lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')
mo=ob.modifiers.new('Armature','ARMATURE'); mo.object=arm; ob.parent=arm
R['weights']=method+'; then vertex_group_smooth x4, limit 4, normalize'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out+f'/{name}_rigged.glb',export_format='GLB',use_selection=True,export_skins=True,export_animations=False,export_draco_mesh_compression_enable=False)
bpy.ops.wm.save_as_mainfile(filepath=out+f'/{name}_rigged.blend')
R['t_rig_secs']=round(time.time()-t0,1)
# ---- pose test: rotations expressed in armature space (rest-orientation independent)
s_=bpy.context.scene; s_.render.engine='BLENDER_EEVEE'; s_.view_settings.view_transform='Standard'
w_=bpy.data.worlds.new('w'); s_.world=w_; w_.use_nodes=True; w_.node_tree.nodes['Background'].inputs[0].default_value=(0.30,0.30,0.32,1)
for loc,e in [((2,-3,3),3.0),((-3,-1.5,1.5),1.5)]:
    L=bpy.data.objects.new('l',bpy.data.lights.new('l','SUN')); L.data.energy=e; L.rotation_euler=(-Vector(loc)).to_track_quat('-Z','Y').to_euler(); s_.collection.objects.link(L)
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); s_.collection.objects.link(cam); s_.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=2.5; cam.location=(0,-6,0.95); cam.rotation_euler=(math.pi/2,0,0)
bpy.context.view_layer.objects.active=arm; arm.select_set(True); bpy.ops.object.mode_set(mode='POSE'); pb=arm.pose.bones
def rot(n,axis,deg):
    Rr=arm.data.bones[n].matrix_local.to_3x3(); Ra=Matrix.Rotation(math.radians(deg),3,axis)
    pb[n].rotation_mode='QUATERNION'; pb[n].rotation_quaternion=(Rr.inverted()@Ra@Rr).to_quaternion()
def clear():
    for b in pb: b.rotation_mode='QUATERNION'; b.rotation_quaternion=Quaternion((1,0,0,0))
poses={'rest':[],'up':[('upperarm_l','Y',-45),('upperarm_r','Y',45),('thigh_l','X',-35)],'down':[('upperarm_l','Y',45),('upperarm_r','Y',-45),('thigh_r','X',-35)]}
s_.render.resolution_x=520; s_.render.resolution_y=800; s_.render.image_settings.file_format='PNG'
for k,p in poses.items():
    clear()
    for n,ax,d in p: rot(n,ax,d)
    bpy.context.view_layer.update(); s_.render.filepath=f'{work}/{name}_pose_{k}.png'; bpy.ops.render.render(write_still=True)
R['head_z']=1.66
json.dump(R,open(out+f'/{name}_rig.json','w'),indent=1); print('RIG',json.dumps(R))
