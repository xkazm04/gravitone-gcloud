# PORTED WITH PROVENANCE (spark game-3d-assets WP2): lynx-bench
# C:\Users\kazda\ai\lynx-bench\pof3d\round4\characters\work\finish_AC.py, 2026-10-21.
# Changes from the source, and nothing else:
#   - a 4th argument, the asset class: only a `character` is scaled to 1.8 m tall (a weapon or a prop keeps
#   -   the generator's scale, centred on x/y with its base at z=0 - its design size is not known here);
#   -   the optional rotation moves to the 5th
#   - the metallic clamp is skipped when the mesh has no node material (it raised before)
#   - glTF export with Draco named OFF (PoF's viewer cannot decode it; the read-back proves it)
#   - usage: finish.py -- <raw.glb> <outdir> <name> <character|weapon|prop> [rotZdeg]
# Run: blender -b --factory-startup -P <this file> -- <args>. Blender's print does not reach a
# caller's stdout reliably, so the result is a JSON FILE the caller reads (lib/foundry/mesh/blender.ts).

# Variants A and C: budget TRELLIS GLB (decimated + baked inside ComfyUI) -> delete floaters (<1% faces), normals, scale 1.8 m, feet at z=0, metallic tamed -> static glb + blend
import bpy,sys,json,time,bmesh,numpy as np,mathutils
a=sys.argv[sys.argv.index('--')+1:]; src,out,name,CLS=a[0],a[1],a[2],a[3]
t0=time.time(); R={'class':CLS}
ROT=float(a[4]) if len(a)>4 else 0.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src,merge_vertices=True)
ob=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
bpy.context.view_layer.objects.active=ob; ob.select_set(True)
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=1e-6); bpy.ops.mesh.quads_convert_to_tris(); bpy.ops.object.mode_set(mode='OBJECT')
import math
me=ob.data
if ROT: me.transform(mathutils.Matrix.Rotation(math.radians(ROT),4,'Z')); me.update(); R['rotated_z_deg']=ROT
R['tris_raw']=len(me.polygons)
# floaters: connected components < 1% of faces
bm=bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
comp={}; sizes=[]
for f in bm.faces:
    if f.index in comp: continue
    cid=len(sizes); st=[f]; comp[f.index]=cid; n=0
    while st:
        x=st.pop(); n+=1
        for e in x.edges:
            for y in e.link_faces:
                if y.index not in comp: comp[y.index]=cid; st.append(y)
    sizes.append(n)
tot=len(bm.faces); kill=[f for f in bm.faces if sizes[comp[f.index]]<0.01*tot]
R['floater_components_removed']=sum(1 for s in sizes if s<0.01*tot); R['floater_faces_removed']=len(kill); R['components_before']=len(sizes)
bmesh.ops.delete(bm,geom=kill,context='FACES'); 
loose=[v for v in bm.verts if not v.link_faces]; bmesh.ops.delete(bm,geom=loose,context='VERTS')
bm.to_mesh(me); bm.free(); me.update()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
co=np.empty(len(me.vertices)*3); me.vertices.foreach_get('co',co); co=co.reshape(-1,3); mn,mx=co.min(0),co.max(0)
s=1.8/(mx[2]-mn[2]) if CLS=='character' else 1.0; R['scale']=float(s)
me.transform(mathutils.Matrix.Scale(s,4)@mathutils.Matrix.Translation((-(mn[0]+mx[0])/2,-(mn[1]+mx[1])/2,-mn[2]))); me.update()
bpy.ops.object.shade_smooth()
# metallic clamp (baked metal renders black in a dark world)
mat=me.materials[0] if me.materials else None; pb=[n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'][0] if mat and mat.use_nodes else None
ml=pb.inputs['Metallic'].links if pb else None
if ml:
    mrn=ml[0].from_node.inputs[0].links[0].from_node; mri=mrn.image
    b2=np.empty(mri.size[0]*mri.size[1]*4,dtype=np.float32); mri.pixels.foreach_get(b2); b2=b2.reshape(-1,4)
    R['metallic_p95_before']=float(np.percentile(b2[:,2],95)); b2[:,2]=np.minimum(b2[:,2],0.5); mri.pixels.foreach_set(b2.ravel()); mri.update(); mri.pack(); R['metallic_clamped_to']=0.5
co=np.empty(len(me.vertices)*3); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)
R['tris_final']=len(me.polygons); R['height_m']=round(float(co[:,2].max()-co[:,2].min()),4); R['extent']=[round(float(x),3) for x in co.max(0)-co.min(0)]
ob.name='SM_'+name
bpy.ops.wm.save_as_mainfile(filepath=out+f'/{name}_finish.blend')
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=out+f'/{name}_static.glb',export_format='GLB',use_selection=True,export_draco_mesh_compression_enable=False)
R['secs']=round(time.time()-t0,1); json.dump(R,open(out+f'/{name}_finish.json','w'),indent=1); print('FINISH',json.dumps(R))
