# PORTED WITH PROVENANCE (spark game-3d-assets WP2): lynx-bench
# C:\Users\kazda\ai\lynx-bench\pof3d\round4\characters\work\render.py, 2026-10-21.
# Changes from the source, and nothing else:
#   - writes <outdir>/<name>_render.json naming the files it rendered
#   - usage unchanged: render.py -- <glb> <outdir> <name> stills|orbit [frames]
# Run: blender -b --factory-startup -P <this file> -- <args>. Blender's print does not reach a
# caller's stdout reliably, so the result is a JSON FILE the caller reads (lib/foundry/mesh/blender.ts).

import bpy,sys,time,math,mathutils,os,numpy as np
a=sys.argv[sys.argv.index('--')+1:]
glb,outdir,name,mode=a[0],a[1],a[2],a[3]     # mode: stills | orbit
os.makedirs(outdir,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'): bpy.data.objects.remove(o,do_unlink=True)
s=bpy.context.scene
objs=[o for o in s.objects if o.type=='MESH']
mn=mathutils.Vector((1e9,)*3); mx=-mn
for o in objs:
    for c in o.bound_box:
        w=o.matrix_world@mathutils.Vector(c); mn=mathutils.Vector(map(min,mn,w)); mx=mathutils.Vector(map(max,mx,w))
ctr=(mn+mx)/2; ext=mx-mn; h=max(ext)
s.render.engine='BLENDER_EEVEE'
try: s.eevee.taa_render_samples=24
except Exception: pass
s.view_settings.view_transform='Standard'
w_=bpy.data.worlds.new('w'); s.world=w_; w_.use_nodes=True; w_.node_tree.nodes['Background'].inputs[0].default_value=(0.30,0.30,0.32,1)
def mklights(parent):
    for loc,e in [((h*1.5,-h*1.5,h*1.5),3.0),((-h*1.5,-h*0.7,h*0.7),1.5),((0,h*1.5,h),1.0)]:
        L=bpy.data.objects.new('l',bpy.data.lights.new('l','SUN')); L.data.energy=e; L.parent=parent; L.location=loc+ctr if parent is None else loc
        L.rotation_euler=(mathutils.Vector((0,0,0))-mathutils.Vector(loc)).to_track_quat('-Z','Y').to_euler(); s.collection.objects.link(L)
piv=bpy.data.objects.new('piv',None); s.collection.objects.link(piv); piv.location=ctr
mklights(piv)
cam=bpy.data.objects.new('cam',bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera=cam
def aim(c,target):
    c.rotation_euler=(target-c.matrix_world.translation).to_track_quat('-Z','Y').to_euler()
def shoot(path,rx,ry):
    s.render.resolution_x=rx; s.render.resolution_y=ry; s.render.resolution_percentage=100
    s.render.image_settings.file_format='PNG'; s.render.filepath=path; bpy.ops.render.render(write_still=True)
t0=time.time()
if mode=='stills':
    # hero 3/4, perspective, 1024
    cam.parent=None; cam.data.type='PERSP'; cam.data.lens=50
    az,el=math.radians(-35),math.radians(18); d=h*1.7
    cam.location=ctr+mathutils.Vector((d*math.cos(el)*math.sin(az)*-1, -d*math.cos(el)*math.cos(az), d*math.sin(el)))
    bpy.context.view_layer.update(); aim(cam,ctr)
    shoot(f'{outdir}/{name}_hero.png',1024,1024)
    # Diablo gameplay camera: orthographic, 30 deg elevation, 45 deg azimuth, 640x480
    cam.data.type='ORTHO'; cam.data.ortho_scale=max(2.0,h*1.7); cam.data.clip_end=100
    az,el=math.radians(45),math.radians(30); d=10
    cam.location=ctr+mathutils.Vector((d*math.cos(el)*math.sin(az), -d*math.cos(el)*math.cos(az), d*math.sin(el)))
    bpy.context.view_layer.update(); aim(cam,ctr)
    shoot(f'{outdir}/{name}_gameplay.png',640,480)
else:
    N=int(a[4]) if len(a)>4 else 120
    cam.parent=piv; cam.data.type='PERSP'; cam.data.lens=50
    el=math.radians(15); d=h*1.9
    cam.location=mathutils.Vector((0,-d*math.cos(el),d*math.sin(el)))
    bpy.context.view_layer.update(); cam.rotation_euler=(mathutils.Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
    os.makedirs(f'{outdir}/{name}_frames',exist_ok=True)
    for f in range(N):
        piv.rotation_euler=(0,0,2*math.pi*f/N); bpy.context.view_layer.update()
        shoot(f'{outdir}/{name}_frames/f_{f+1:04d}.png',576,768)
import json
files=[f'{outdir}/{name}_hero.png',f'{outdir}/{name}_gameplay.png'] if mode=='stills' else [f'{outdir}/{name}_frames']
json.dump({'mode':mode,'files':[f for f in files if os.path.exists(f)],'secs':round(time.time()-t0,1)},open(f'{outdir}/{name}_render.json','w'))
print('RENDER_SECS',mode,round(time.time()-t0,1))
