# PORTED WITH PROVENANCE (spark game-3d-assets WP2): lynx-bench
# C:\Users\kazda\ai\lynx-bench\pof3d\round4\characters\work\pofmetrics2.py + met.py, 2026-10-21.
# Changes from the source, and nothing else:
#   - met.py's one rule folded into the entry point: bbox reordered to glTF's Y-up [x, height, z],
#   -   the axes PoF's world-scale and orientation grades read
#   - usage: metrics.py -- <glb> <out.json>
# Run: blender -b --factory-startup -P <this file> -- <args>. Blender's print does not reach a
# caller's stdout reliably, so the result is a JSON FILE the caller reads (lib/foundry/mesh/blender.ts).

"""Re-implementation (numpy, run inside Blender python) of scripts/visual-gen/pof_mesh_critique.py metrics.
trimesh is not installed here; vertices are welded by exact position like trimesh.load(process=True)."""
import numpy as np, bpy, json, sys

def glb_metrics(glb):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    V=[];F=[];off=0
    for o in bpy.context.scene.objects:
        if o.type!='MESH' or o.name.startswith('Icosphere') or 'glTF_not' in str([c.name for c in o.users_collection]): continue
        me=o.data; me.calc_loop_triangles()
        mw=np.array(o.matrix_world)
        co=np.empty(len(me.vertices)*3,dtype=np.float64); me.vertices.foreach_get('co',co); co=co.reshape(-1,3)
        co=(co@mw[:3,:3].T+mw[:3,3])
        tr=np.empty(len(me.loop_triangles)*3,dtype=np.int64); me.loop_triangles.foreach_get('vertices',tr)
        V.append(co);F.append(tr.reshape(-1,3)+off);off+=len(co)
    V=np.vstack(V).astype(np.float32);F=np.vstack(F)
    # glTF space (Y-up) as trimesh sees it: blender (x,y,z) -> gltf (x,z,-y); extents are axis-order agnostic anyway
    _,inv=np.unique(V,axis=0,return_inverse=True); inv=inv.ravel()
    Vm=np.zeros((inv.max()+1,3),dtype=np.float64); Vm[inv]=V
    Fm=inv[F]
    return compute(Vm,Fm)

def compute(V,F):
    # drop nothing (trimesh keeps degenerate faces in process=True? it removes none by default except duplicates)
    nF=len(F)
    e=np.vstack([F[:,[0,1]],F[:,[1,2]],F[:,[2,0]]])
    es=np.sort(e,axis=1)
    key=es[:,0].astype(np.int64)*(len(V)+1)+es[:,1]
    uk,inv,cnt=np.unique(key,return_inverse=True,return_counts=True)
    watertight=bool((cnt==2).all())
    # winding: each edge with 2 faces must be traversed in opposite directions
    fi=np.tile(np.arange(nF),3)
    dirsign=(e[:,0]<e[:,1]).astype(int)
    wind=True
    two=np.where(cnt==2)[0]
    if len(two):
        order=np.argsort(inv,kind='stable'); inv_s=inv[order]
        starts=np.searchsorted(inv_s,two)
        a=order[starts];b=order[starts+1]
        wind=bool((dirsign[a]!=dirsign[b]).all())
    # components via face adjacency (edges shared by faces), union-find
    parent=np.arange(nF)
    def find(x):
        while parent[x]!=x:
            parent[x]=parent[parent[x]];x=parent[x]
        return x
    order=np.argsort(inv,kind='stable'); inv_s=inv[order]
    bounds=np.flatnonzero(np.diff(inv_s))+1
    groups=np.split(order,bounds)
    for g in groups:
        if len(g)>=2:
            f0=fi[g[0]]
            for x in g[1:]:
                r1=find(f0);r2=find(fi[x])
                if r1!=r2: parent[r2]=r1
    roots=np.array([find(i) for i in range(nF)])
    _,counts=np.unique(roots,return_counts=True)
    comp=sorted(counts.tolist(),reverse=True)
    ext=V.max(0)-V.min(0)
    v0,v1,v2=V[F[:,0]],V[F[:,1]],V[F[:,2]]
    cr=np.cross(v1-v0,v2-v0); ar=np.linalg.norm(cr,axis=1)/2
    area=float(ar.sum())
    vol=float(np.einsum('ij,ij->i',v0,np.cross(v1,v2)).sum()/6) if watertight else None
    used=len(np.unique(F))
    nE=len(uk)
    return dict(verts=int(used),faces=int(nF),watertight=watertight,windingConsistent=wind,components=len(comp),
        euler=int(used-nE+nF),bbox=[round(float(x),4) for x in ext],volume=vol,area=area,
        degenerateFaces=int((ar<1e-12).sum()),componentFaces=comp[:4096],componentFacesOmitted=max(0,len(comp)-4096))

if __name__=='__main__':
    a=sys.argv[sys.argv.index('--')+1:]
    m=glb_metrics(a[0]); b=m['bbox']; m['bbox']=[b[0],b[2],b[1]]  # glTF Y-up order [x,height,z] (met.py)
    json.dump(m,open(a[1],'w'))
    print('METRICS',{k:(v if k!='componentFaces' else v[:10]) for k,v in m.items()})
