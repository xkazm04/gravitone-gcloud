# PORTED WITH PROVENANCE (spark game-3d-assets WP2): lynx-bench
# ~\ai\lynx-bench\pof3d\round4\characters\work\views4.py, 2026-10-21.
# Changes from the source, and nothing else:
#   - writes <out>_views.json naming the four views it rendered (front, right, back, left)
#   - usage unchanged: views4.py -- <glb> <out-prefix>
# Run: blender -b --factory-startup -P <this file> -- <args>. Blender's print does not reach a
# caller's stdout reliably, so the result is a JSON FILE the caller reads (lib/foundry/mesh/blender.ts).

import bpy,sys,math
a=sys.argv[sys.argv.index('--')+1:]; glb,out=a[0],a[1]
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=glb)
s=bpy.context.scene; s.render.engine='BLENDER_EEVEE'; s.view_settings.view_transform='Standard'
w=bpy.data.worlds.new('w'); s.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[0].default_value=(0.4,0.4,0.42,1)
L=bpy.data.objects.new('l',bpy.data.lights.new('l','SUN')); L.data.energy=3; L.rotation_euler=(0.8,0.2,0.5); s.collection.objects.link(L)
cam=bpy.data.objects.new('c',bpy.data.cameras.new('c')); s.collection.objects.link(cam); s.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=2.2
s.render.resolution_x=300; s.render.resolution_y=450
for i,(x,y) in enumerate([(0,-6),(6,0),(0,6),(-6,0)]):
    cam.location=(x,y,0.9); cam.rotation_euler=(math.pi/2,0,[0,math.pi/2,math.pi,-math.pi/2][i])
    s.render.filepath=f'{out}_{i}.png'; bpy.ops.render.render(write_still=True)
import json,os
json.dump({'files':[f'{out}_{i}.png' for i in range(4) if os.path.exists(f'{out}_{i}.png')]},open(f'{out}_views.json','w'))
