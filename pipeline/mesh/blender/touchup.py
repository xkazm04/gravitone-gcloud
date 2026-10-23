# PORTED WITH PROVENANCE (spark game-3d-assets WP2): lynx-bench
# ~\ai\lynx-bench\pof3d\round4\weapons\work\touchup.py (round-4 M1), 2026-10-21.
# Changes from the source, and nothing else:
#   - glTF export with Draco named OFF (PoF's viewer cannot decode it; the read-back proves it)
#   - usage unchanged: touchup.py -- <src.glb> <concept.png> <outbase> <sword|mace|axe|staff>
# Run: blender -b --factory-startup -P <this file> -- <args>. Blender's print does not reach a
# caller's stdout reliably, so the result is a JSON FILE the caller reads (lib/foundry/mesh/blender.ts).

# round-4 M1: automated mesh touch-up for TRELLIS budget weapons. No hand edits; every step is a rule.
# usage: blender -b --python touchup.py -- <src.glb> <concept.png> <outbase> <sword|mace|axe|staff>
#   src with SOCKET_* empties (a finished round-2/3 A variant) keeps its transform; a raw TRELLIS GLB is oriented first.
# steps: weld -> floaters/stray shells -> extra mirrored blade (cross-section along the haft) -> over-thick shaft (radial slim)
#        -> recalc normals + fill small holes -> concept projection: palette regrade + accent restore + emissive accents
#        -> 4 slots by height bands -> re-authored sockets -> FBX + GLB + report json
import bpy, bmesh, sys, os, json, math, time, numpy as np
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, concept, outbase, kind = os.path.abspath(a[0]), os.path.abspath(a[1]), os.path.abspath(a[2]), a[3]
SPEC = {
 'sword': dict(L=1.08, names=['M_SwordBlade', 'M_SwordGuard', 'M_SwordGrip', 'M_SwordAccent'], shaft_r_max=None, single_blade=False),
 'mace':  dict(L=0.75, names=['M_MaceHead', 'M_MaceHaft', 'M_MaceGrip', 'M_MaceAccent'], shaft_r_max=None, single_blade=False),
 'axe':   dict(L=1.55, names=['M_AxeBlade', 'M_AxeHaft', 'M_AxeGrip', 'M_AxeAccent'], shaft_r_max=0.020, single_blade=True),
 'staff': dict(L=1.85, names=['M_StaffHead', 'M_StaffWood', 'M_StaffBinding', 'M_StaffAccent'], shaft_r_max=0.016, single_blade=False),
}[kind]
rep = {'kind': kind, 'src': src, 'concept': concept, 'fixed': [], 'not_fixed': []}
T0 = time.time()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src, merge_vertices=True)
sock_in = {o.name.split('.')[0]: tuple(o.matrix_world.translation) for o in bpy.context.scene.objects if o.type == 'EMPTY' and o.name.startswith('SOCKET')}
for o in [o for o in bpy.context.scene.objects if o.type == 'EMPTY']: bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
ob = bpy.context.view_layer.objects.active; ob.parent = None
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = ob.data
ntri = lambda m: sum(len(p.vertices) - 2 for p in m.polygons)
rep['src_tris'] = ntri(me)
def V(m):
    co = np.empty(len(m.vertices) * 3); m.vertices.foreach_get('co', co); return co.reshape(-1, 3)
def widths(v, bins=60):
    z = v[:, 2]; zmin, zmax = z.min(), z.max(); idx = np.clip(((z - zmin) / (zmax - zmin) * bins).astype(int), 0, bins - 1)
    return zmin, zmax, np.array([max(np.ptp(v[idx == b][:, 0]), np.ptp(v[idx == b][:, 1])) if (idx == b).any() else 0 for b in range(bins)])

# ---------- 0. orient a raw TRELLIS mesh (round-3 r3_finish rule: head up, scale to design length, origin at the lower hand)
if not sock_in:
    v = V(me); zmin, zmax, wid = widths(v)
    up_wrong = (int(np.argmax(wid)) > 30) if kind == 'sword' else (wid[:20].max() > wid[-20:].max())   # sword: crossguard in the lower half; others: head on top
    if up_wrong:
        me.transform(Matrix.Rotation(math.pi, 4, 'X')); rep['flipped'] = True
    v = V(me); zmin, zmax = v[:, 2].min(), v[:, 2].max(); Lr = zmax - zmin
    sh = v[(v[:, 2] > zmin + 0.2 * Lr) & (v[:, 2] < zmin + 0.5 * Lr)]
    me.transform(Matrix.Translation((-np.median(sh[:, 0]), -np.median(sh[:, 1]), -(zmin + 0.27 * Lr))))
    me.transform(Matrix.Scale(SPEC['L'] / Lr, 4)); me.update()
    if kind == 'sword':   # sword origin = middle of the grip (between the lowest point and the crossguard)
        v = V(me); zmin, zmax, wid = widths(v); g = int(np.argmax(wid[:27])); gb = g
        while gb - 1 >= 0 and wid[gb - 1] > 0.5 * wid[g]: gb -= 1
        zg = zmin + gb / 60 * (zmax - zmin); me.transform(Matrix.Translation((0, 0, -(zmin + zg) / 2))); me.update()
    rep['oriented'] = 'raw input: head-up, scaled to %.2f m, origin at 27%% height (sword: mid-grip)' % SPEC['L']
else:
    rep['oriented'] = 'kept source transform (finished A variant)'

# ---------- 1. weld
bm = bmesh.new(); bm.from_mesh(me)
nv = len(bm.verts); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); rep['welded_verts'] = nv - len(bm.verts)

# ---------- 2. floaters / stray shells (islands under 1% of faces AND under 8% of length; or under 0.15% of faces)
def islands(bm):
    bm.faces.ensure_lookup_table(); seen = set(); out = []
    for f in bm.faces:
        if f.index in seen: continue
        st = [f]; comp = []; seen.add(f.index)
        while st:
            g = st.pop(); comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); st.append(h)
        out.append(comp)
    return out
isl = islands(bm); nf = len(bm.faces); Lnow = max(v.co.z for v in bm.verts) - min(v.co.z for v in bm.verts)
kill = []; small = []
for c in isl:
    pts = np.array([v.co[:] for f in c for v in f.verts]); diag = np.linalg.norm(pts.max(0) - pts.min(0))
    if (len(c) < 0.01 * nf and diag < 0.08 * Lnow) or len(c) < 0.0015 * nf:
        kill += c; small.append(len(c))
bmesh.ops.delete(bm, geom=kill, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
rep['shells_in'] = len(isl); rep['floaters_removed'] = len(small); rep['floater_faces_removed'] = int(sum(small))
if small: rep['fixed'].append(f'removed {len(small)} floater/stray shells ({sum(small)} faces)')
bm.to_mesh(me); me.update()
v_align = V(me)                        # geometry used for concept alignment and texel positions (before shape edits)
oa = me.attributes.new('orig_co', 'FLOAT_VECTOR', 'POINT'); oa.data.foreach_set('vector', v_align.ravel())

# ---------- landmarks on the cleaned mesh
def landmarks(v):
    zmin, zmax, wid = widths(v); Lr = zmax - zmin; zb = lambda b: zmin + b / 60 * Lr
    sh = v[(v[:, 2] > zmin + 0.25 * Lr) & (v[:, 2] < zmin + 0.45 * Lr)]
    zz = np.linspace(zmin + 0.25 * Lr, zmin + 0.45 * Lr, 11); rr = []
    for i in range(10):
        b = v[(v[:, 2] >= zz[i]) & (v[:, 2] < zz[i + 1])]
        if len(b) > 8: rr.append(0.25 * (np.ptp(b[:, 0]) + np.ptp(b[:, 1])))
    r_shaft = float(np.median(rr)) if rr else 0.0     # half the mean of the x/y spans, per 1/50-length slice
    if kind == 'sword':   # guard = widest bin in the lower 45%; blade base = top of the guard band
        lo = wid[:27]; g = int(np.argmax(lo)); gt = g
        while gt + 1 < 60 and wid[gt + 1] > 0.5 * lo.max(): gt += 1
        gb = g
        while gb - 1 >= 0 and wid[gb - 1] > 0.5 * lo.max(): gb -= 1
        return dict(zmin=zmin, zmax=zmax, head_bot=zb(gt + 1), guard_bot=zb(gb), grip_bot=zmin + 0.06 * Lr, r_shaft=r_shaft)
    top = wid[30:]; hb = 30 + int(np.argmax(top > 0.45 * top.max()))
    return dict(zmin=zmin, zmax=zmax, head_bot=zb(hb), grip_bot=zmin + 0.06 * Lr, grip_top=zmin + 0.40 * Lr, r_shaft=r_shaft)
lm = landmarks(v_align); rep['shaft_radius_cm_in'] = round(lm['r_shaft'] * 100, 2)

# ---------- 3. extra mirrored blade: cross-section of the head band along the blade axis
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
if SPEC['single_blade']:
    v = V(me); head = v[v[:, 2] >= lm['head_bot']]
    ax = 0 if np.ptp(head[:, 0]) >= np.ptp(head[:, 1]) else 1
    rc = max(2.5 * lm['r_shaft'], 0.035)
    area = {s: sum(f.calc_area() for f in bm.faces if f.calc_center_median().z >= lm['head_bot'] and s * f.calc_center_median()[ax] > rc) for s in (1, -1)}
    big, sml = (1, -1) if area[1] >= area[-1] else (-1, 1)
    ratio = area[sml] / max(area[big], 1e-9); rep['blade_area_ratio_minor_to_major'] = round(ratio, 3)
    if ratio > 0.35:
        cut = [f for f in bm.faces if f.calc_center_median().z >= lm['head_bot'] - 0.02 and sml * f.calc_center_median()[ax] > rc]
        rep['second_blade'] = dict(axis='xy'[ax], removed_side=sml, cut_beyond_cm=round(rc * 100, 1), faces_removed=len(cut))
        bmesh.ops.delete(bm, geom=cut, context='FACES')
        bmesh.ops.delete(bm, geom=[x for x in bm.verts if not x.link_faces], context='VERTS')
        rep['fixed'].append(f'second blade detected (minor/major area {ratio:.2f}) and deleted: {len(cut)} faces beyond {rc*100:.1f} cm on the {"+" if sml > 0 else "-"}{"xy"[ax]} side')
        rep['not_fixed'].append('second blade is deleted, not replaced: the back of the head is a flat cut stub (no back spike or poll is modelled)')
    else:
        rep['second_blade'] = 'not detected'
        rep['fixed'].append(f'single blade confirmed by cross-section (minor/major area {ratio:.2f}); nothing deleted')

# ---------- 4. over-thick shaft: radial slim below the head, ramped over 6 cm
if SPEC['shaft_r_max'] and lm['r_shaft'] > 1.15 * SPEC['shaft_r_max']:
    f = SPEC['shaft_r_max'] / lm['r_shaft']; top = lm['head_bot'] - 0.02
    vv = np.array([x.co[:] for x in bm.verts]); zb_ = np.arange(vv[:, 2].min(), top + 0.02, 0.02); ctr = {}
    for i in range(len(zb_)):   # slice centre (the shaft wanders); slim about it, not about the origin
        b = vv[(vv[:, 2] >= zb_[i] - 0.02) & (vv[:, 2] < zb_[i] + 0.04)]
        ctr[i] = ((b[:, 0].max() + b[:, 0].min()) / 2, (b[:, 1].max() + b[:, 1].min()) / 2) if len(b) else (0, 0)
    for x in bm.verts:
        z = x.co.z
        w = 1.0 if z < top - 0.06 else (0.0 if z > top else (top - z) / 0.06)
        s = 1 - (1 - f) * w; c = ctr[min(max(int((z - zb_[0]) / 0.02), 0), len(zb_) - 1)]
        x.co.x = c[0] + (x.co.x - c[0]) * s; x.co.y = c[1] + (x.co.y - c[1]) * s
    rep['shaft_slim'] = dict(factor=round(f, 3), radius_cm_out=round(SPEC['shaft_r_max'] * 100, 2), below_cm=round(top * 100, 1))
    rep['fixed'].append(f'shaft slimmed radially x{f:.2f} ({lm["r_shaft"]*100:.1f} -> {SPEC["shaft_r_max"]*100:.1f} cm radius) below {top*100:.0f} cm')
    if kind == 'staff': rep['not_fixed'].append('slimming is radial only: knots, bindings and the foot cap shrink with the shaft; the shaft keeps its waviness')

isl2 = islands(bm); nf2 = len(bm.faces); big2 = max(len(c) for c in isl2)
k2 = [c for c in isl2 if len(c) < 0.02 * nf2 and len(c) < big2]
if k2:
    bmesh.ops.delete(bm, geom=[f for c in k2 for f in c], context='FACES'); bmesh.ops.delete(bm, geom=[x for x in bm.verts if not x.link_faces], context='VERTS')
    rep['fragments_removed_after_edits'] = len(k2); rep['fixed'].append(f'removed {len(k2)} fragments left by the shape edits ({sum(len(c) for c in k2)} faces)')
# ---------- 5. winding + cheap hole fill
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bnd = [e for e in bm.edges if e.is_boundary]; rep['boundary_edges_before_fill'] = len(bnd)
res = bmesh.ops.holes_fill(bm, edges=bnd, sides=24)
bmesh.ops.triangulate(bm, faces=res['faces'])
rep['holes_filled'] = len(res['faces']); rep['boundary_edges_after_fill'] = sum(1 for e in bm.edges if e.is_boundary)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(me); bm.free(); me.update()
if rep['holes_filled']: rep['fixed'].append(f'filled {rep["holes_filled"]} small holes (<=24 sides); normals recalculated')
if rep['boundary_edges_after_fill']: rep['not_fixed'].append(f'{rep["boundary_edges_after_fill"]} open boundary edges remain (large openings of the UDF shell are not capped)')
nm_edges = 0
bm2 = bmesh.new(); bm2.from_mesh(me); nm_edges = sum(1 for e in bm2.edges if not e.is_manifold and not e.is_boundary); bm2.free()
rep['non_manifold_edges'] = nm_edges

# ---------- 6. concept projection: alignment by silhouette IoU over 4 view axes
def load_px(path):
    im = bpy.data.images.load(path); w, h = im.size; b = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(b)
    return b.reshape(h, w, 4)[:, :, :3]                 # row 0 = bottom
cp = load_px(concept); ch, cw = cp.shape[:2]
border = np.concatenate([cp[:4].reshape(-1, 3), cp[-4:].reshape(-1, 3), cp[:, :4].reshape(-1, 3), cp[:, -4:].reshape(-1, 3)])
edge = np.concatenate([cp[:, :max(4, cw // 25)], cp[:, -max(4, cw // 25):]], 1)
bgrow = np.median(edge, 1)                            # per-row background (handles vertical gradients / vignettes)
dist = np.abs(cp - bgrow[:, None, :]).max(2)
mask = dist > 0.09
rows = np.where(mask.sum(1) > 2)[0]; cols = np.where(mask.sum(0) > 2)[0]
r0, r1, c0, c1 = rows.min(), rows.max(), cols.min(), cols.max()
def raster(u, w_, G=96):
    g = np.zeros((G, G), bool); ui = np.clip((u * G).astype(int), 0, G - 1); wi = np.clip((w_ * G).astype(int), 0, G - 1); g[wi, ui] = True; return g
cm = mask[r0:r1 + 1, c0:c1 + 1]; G = 96
cmg = np.zeros((G, G), bool)
ry = (np.arange(G) * cm.shape[0] / G).astype(int); rx = (np.arange(G) * cm.shape[1] / G).astype(int); cmg = cm[np.ix_(ry, rx)]
tri = np.empty(len(me.polygons) * 3, dtype=np.int64)
me.polygons.foreach_get('vertices', tri); tri = tri.reshape(-1, 3)
# texel positions use v_align for faces that still exist: map current faces to aligned positions via vertex count (shape edits only move/delete)
va = np.empty(len(me.vertices) * 3); me.attributes['orig_co'].data.foreach_get('vector', va); va = va.reshape(-1, 3)   # pre-edit positions of surviving verts
best = None
zlo, zhi = v_align[:, 2].min(), v_align[:, 2].max()
samp = va[tri].mean(1)
for ax in (0, 1):
    for sg in (1, -1):
        h = sg * v_align[:, ax]; lo_, hi_ = h.min(), h.max()
        u = (sg * samp[:, ax] - lo_) / (hi_ - lo_ + 1e-9); w_ = (samp[:, 2] - zlo) / (zhi - zlo + 1e-9)
        g = raster(u, w_); g = g | np.roll(g, 1, 0) | np.roll(g, 1, 1)
        iou = (g & cmg).sum() / max((g | cmg).sum(), 1)
        if best is None or iou > best[0]: best = (iou, ax, sg, lo_, hi_)
iou, ax, sg, hlo, hhi = best
rep['concept_alignment'] = dict(view_axis='xy'[ax], mirrored=sg < 0, silhouette_iou=round(float(iou), 3), concept_bbox_px=[int(c0), int(r0), int(c1), int(r1)])
# when the second blade was removed, the concept's horizontal range maps to the pre-cut head width
h0 = sg * v_align[:, ax]; hlo, hhi = h0.min(), h0.max(); zlo, zhi = v_align[:, 2].min(), v_align[:, 2].max()
def to_px(p):
    u = (sg * p[..., ax] - hlo) / (hhi - hlo + 1e-9); w_ = (p[..., 2] - zlo) / (zhi - zlo + 1e-9)
    return c0 + u * (c1 - c0), r0 + w_ * (r1 - r0)

# ---------- 7. base-colour atlas: UV raster -> texel 3D position -> concept colour; regrade chroma, restore accents, emissive mask
mat0 = me.materials[0]
pb = [n for n in mat0.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
img = pb.inputs['Base Color'].links[0].from_node.image
W, H = img.size
buf = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(buf); px = buf.reshape(H, W, 4)
uv = np.empty(len(me.loops) * 2); me.uv_layers[0].data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
lstart = np.empty(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('loop_start', lstart)
pos = np.full((H, W, 3), np.nan, dtype=np.float32)
for fi in range(len(tri)):
    t = uv[lstart[fi]:lstart[fi] + 3] * [W, H]; P = va[tri[fi]]
    x0, y0 = np.floor(t.min(0)).astype(int) - 1; x1, y1 = np.ceil(t.max(0)).astype(int) + 1
    x0 = max(x0, 0); y0 = max(y0, 0); x1 = min(x1, W - 1); y1 = min(y1, H - 1)
    if x1 < x0 or y1 < y0: continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    (ax_, ay), (bx, by), (cx_, cy_) = t
    d = (by - cy_) * (ax_ - cx_) + (cx_ - bx) * (ay - cy_)
    if abs(d) < 1e-14: continue
    l1 = ((by - cy_) * (xs - cx_) + (cx_ - bx) * (ys - cy_)) / d; l2 = ((cy_ - ay) * (xs - cx_) + (ax_ - cx_) * (ys - cy_)) / d; l3 = 1 - l1 - l2
    m = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
    pp = l1[..., None] * P[0] + l2[..., None] * P[1] + l3[..., None] * P[2]
    sub = pos[y0:y1 + 1, x0:x1 + 1]; sub[m] = pp[m]
for _ in range(6):   # dilate positions into the bake margin
    z = np.isnan(pos[:, :, 0])
    if not z.any(): break
    for sh in ((1, 0), (-1, 0), (1, 1), (-1, 1)):
        nb = np.roll(pos, sh[0], sh[1]); fill = z & ~np.isnan(nb[:, :, 0]); pos[fill] = nb[fill]; z = np.isnan(pos[:, :, 0])
has = ~np.isnan(pos[:, :, 0])
cxp, cyp = to_px(np.nan_to_num(pos))
cxi = np.clip(np.round(cxp).astype(int), 0, cw - 1); cyi = np.clip(np.round(cyp).astype(int), 0, ch - 1)
# concept colour from a 5x5 box blur (TRELLIS shape vs concept misregistration of a few px)
from numpy.lib.stride_tricks import sliding_window_view
pad = np.pad(cp, ((2, 2), (2, 2), (0, 0)), mode='edge'); cbl = sliding_window_view(pad, (5, 5), axis=(0, 1)).mean((-1, -2))
pmask = np.pad(mask.astype(np.float32), 2, mode='edge'); mbl = sliding_window_view(pmask, (5, 5)).mean((-1, -2))
cc = cbl[cyi, cxi]; inside = has & (mbl[cyi, cxi] > 0.6)
lin2s = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)
s2lin = lambda c: np.where(c <= 0.04045, c / 12.92, np.power((c + 0.055) / 1.055, 2.4))
cur = lin2s(px[:, :, :3]); con = lin2s(cc)
LW = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
lc, lk = cur @ LW, con @ LW
satk = (con.max(2) - con.min(2)) / (con.max(2) + 1e-4); satc = (cur.max(2) - cur.min(2)) / (cur.max(2) + 1e-4)
accent = inside & (satk > 0.35) & (con.max(2) > 0.30)             # saturated concept accents (red tip, gold, crystal)
glow = inside & (lk > 0.35) & (satk > 0.20) & (con[:, :, 2] > con[:, :, 0] + 0.08) & (con[:, :, 2] >= con[:, :, 1])   # bright cool hue = crystal / magic glow
accent |= glow
# luminance target: 50/50 current detail and concept value; chroma: concept chroma at that luminance
lt = 0.5 * lc + 0.5 * lk
chroma = con - lk[..., None]
wgt = np.where(accent, 0.9, 0.55)[..., None] * inside[..., None]
newc = lt[..., None] + chroma * np.clip(lt / (lk + 1e-3), 0.4, 1.6)[..., None]
out = cur * (1 - wgt) + newc * wgt
out = np.where((accent & ~glow)[..., None], np.maximum(out, 0.0), out)
out = np.clip(out, 0, 1)
px2 = px.copy(); px2[:, :, :3] = s2lin(out)
rep['texels_mapped_pct'] = round(100 * inside.sum() / max(has.sum(), 1), 1)
rep['accent_texels_pct'] = round(100 * accent.sum() / max(has.sum(), 1), 2); rep['emissive_texels_pct'] = round(100 * glow.sum() / max(has.sum(), 1), 2)
rep['fixed'].append(f'palette regraded toward the concept on {rep["texels_mapped_pct"]}% of texels (concept silhouette IoU {iou:.2f})')
if accent.any(): rep['fixed'].append(f'accent colours restored from the concept on {rep["accent_texels_pct"]}% of texels')
gimg = bpy.data.images.new('touchup_basecolor', W, H, alpha=False); gimg.pixels.foreach_set(px2.ravel())
gimg.filepath_raw = outbase + '_basecolor.png'; gimg.file_format = 'PNG'; gimg.save(); gl = bpy.data.images.load(outbase + '_basecolor.png'); gl.pack()
emi = None
if glow.any():
    e = np.zeros((H, W, 4), dtype=np.float32); e[:, :, 3] = 1
    gk = s2lin(np.clip(con * 1.15, 0, 1)); e[:, :, :3] = np.where(glow[..., None], gk, 0)
    # grow the emissive mask 2 px so seams do not show dark rims
    for _ in range(2):
        nb = np.maximum.reduce([np.roll(e, 1, 0), np.roll(e, -1, 0), np.roll(e, 1, 1), np.roll(e, -1, 1)]); e = np.where(has[..., None], np.maximum(e, nb * 0.9), e); e[:, :, 3] = 1
    eimg = bpy.data.images.new('touchup_emissive', W, H, alpha=False); eimg.pixels.foreach_set(e.ravel())
    eimg.filepath_raw = outbase + '_emissive.png'; eimg.file_format = 'PNG'; eimg.save(); emi = bpy.data.images.load(outbase + '_emissive.png'); emi.pack()
    rep['fixed'].append(f'emissive accent map from the concept glow ({rep["emissive_texels_pct"]}% of texels, strength 3)')
elif kind == 'staff':
    rep['not_fixed'].append('no glowing accent found in the concept projection, so no emissive map')

# ---------- 8. slots (height bands) + materials
v = V(me); lm2 = landmarks(v); cen = v[tri].mean(1); cz = cen[:, 2]
reg = np.ones(len(tri), dtype=np.int32); reg[cz >= lm2['head_bot']] = 0
if kind == 'sword':
    reg[:] = 2; reg[cz >= lm2['guard_bot']] = 1; reg[cz >= lm2['head_bot']] = 0; reg[cz < lm2['grip_bot']] = 3
else:
    reg[(cz >= lm2['grip_bot']) & (cz < lm2['grip_top'])] = 2; reg[cz < lm2['grip_bot']] = 3
if 'metallic' not in rep:
    ml = pb.inputs['Metallic'].links
    if ml:
        try:
            mrn = ml[0].from_node.inputs[0].links[0].from_node; mri = mrn.image
            b2 = np.empty(mri.size[0] * mri.size[1] * 4, dtype=np.float32); mri.pixels.foreach_get(b2); b2 = b2.reshape(-1, 4)
            b2[:, 2] = np.minimum(b2[:, 2], 0.55); mri.pixels.foreach_set(b2.ravel()); mri.update(); mri.pack(); rep['metallic_clamped_to'] = 0.55
        except Exception as ex: rep['metallic_note'] = str(ex)[:120]
base = mat0.copy(); me.materials.clear()
for nm in SPEC['names']:
    m = base.copy(); m.name = nm
    for n in m.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image == img: n.image = gl
    bs = [n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    if emi is not None:
        te = m.node_tree.nodes.new('ShaderNodeTexImage'); te.image = emi
        m.node_tree.links.new(te.outputs['Color'], bs.inputs['Emission Color']); bs.inputs['Emission Strength'].default_value = 3.0
    me.materials.append(m)
me.polygons.foreach_set('material_index', reg); me.attributes.remove(me.attributes['orig_co']); me.update()
rep['faces_per_slot'] = [int((reg == i).sum()) for i in range(4)]
ob.name = f'SM_{kind.capitalize()}_TouchUp'

# ---------- 9. sockets re-authored from the cleaned mesh
top_pts = v[v[:, 2] > lm2['zmax'] - 0.01]
tipxy = top_pts[:, :2].mean(0) if kind in ('sword', 'staff') else (0.0, 0.0)
sockets = {'SOCKET_Base': (0.0, 0.0, float(lm2['head_bot'])), 'SOCKET_Tip': (float(tipxy[0]), float(tipxy[1]), float(lm2['zmax'])), 'SOCKET_Grip': (0.0, 0.0, 0.0)}
for nm, loc in sockets.items():
    e = bpy.data.objects.new(nm, None); e.empty_display_type = 'PLAIN_AXES'; e.empty_display_size = 0.03
    e.location = loc; e.parent = ob; bpy.context.scene.collection.objects.link(e)
rep['sockets_in_cm'] = {k: [round(x * 100, 1) for x in p] for k, p in sock_in.items()}
rep['sockets_cm'] = {k: [round(x * 100, 1) for x in p] for k, p in sockets.items()}
rep['landmarks_cm'] = {k: round(x * 100, 1) for k, x in lm2.items()}
rep['fixed'].append('sockets re-authored: Base at the detected head/guard top, Tip at the top vertex cluster, Grip at the origin (lower hand)')
rep['tris'] = ntri(me); rep['materials'] = len(me.materials)
bpy.context.scene.render.engine = 'BLENDER_EEVEE'
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.fbx(filepath=outbase + '.fbx', use_selection=True, apply_unit_scale=True, apply_scale_options='FBX_SCALE_UNITS',
    object_types={'MESH', 'EMPTY'}, path_mode='COPY', embed_textures=True, use_mesh_modifiers=True, bake_anim=False)
bpy.ops.export_scene.gltf(filepath=outbase + '.glb', export_format='GLB', use_selection=True, export_draco_mesh_compression_enable=False)
rep['sec'] = round(time.time() - T0, 1)
json.dump(rep, open(outbase + '.touchup.json', 'w'), indent=1); print('TOUCHUP', json.dumps(rep)[:3000])
