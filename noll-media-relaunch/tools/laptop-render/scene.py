"""Laptop scroll sequence for the noll media case pages.

Builds a generic, brand-free laptop procedurally in Blender (bpy), lights it
like a product shot and renders the opening + push-in as a frame sequence,
plus screen-track.json with the display's projected corners per frame (so the
page can lay live HTML over the display, the way Apple/garcon do it).

usage: python scene.py OUTDIR [--w 1920 --h 1080 --samples 64 --frames 0-89 --test]
"""
import bpy, bmesh, math, json, sys, os, argparse
from mathutils import Vector, Matrix, Quaternion
from bpy_extras.object_utils import world_to_camera_view

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--w', type=int, default=1920)
ap.add_argument('--h', type=int, default=1080)
ap.add_argument('--samples', type=int, default=64)
ap.add_argument('--frames', default='all')
ap.add_argument('--n-open', type=int, default=40)
ap.add_argument('--n-zoom', type=int, default=36)
ap.add_argument('--track-only', action='store_true')
ap.add_argument('--blend', default='')
ap.add_argument('--export', default='')
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
os.makedirs(args.out, exist_ok=True)

# ---------------------------------------------------------------- reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- dimensions (m)
W, D, H = 0.304, 0.215, 0.0148      # base
R = 0.0125                          # plan-view corner radius
LT = 0.0056                         # lid thickness
LD = 0.211                          # lid height

# ---------------------------------------------------------------- helpers
def rounded_rect(w, d, r, seg=12, cx=0.0, cy=0.0):
    pts = []
    for (sx, sy, a0) in [(1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)]:
        ccx, ccy = cx + sx * (w / 2 - r), cy + sy * (d / 2 - r)
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((ccx + r * math.cos(a), ccy + r * math.sin(a)))
    return pts

def slab(name, w, d, h, r, z0=0.0, cx=0.0, cy=0.0, bevel=0.0, bseg=5, seg=12):
    """Rounded-rectangle slab from z0 to z0+h, rims bevelled."""
    bm = bmesh.new()
    pts = rounded_rect(w, d, r, seg, cx, cy)
    vb = [bm.verts.new((x, y, z0)) for x, y in pts]
    fb = bm.faces.new(vb)
    ext = bmesh.ops.extrude_face_region(bm, geom=[fb])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += h
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    if bevel > 0:
        m = ob.modifiers.new('bevel', 'BEVEL')
        m.width = bevel; m.segments = bseg; m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(40); m.harden_normals = False
        m.profile = 0.6
        apply_mods(ob)
    smooth_by_angle(ob, 30)
    return ob

def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        with bpy.context.temp_override(object=ob, active_object=ob):
            bpy.ops.object.modifier_apply(modifier=m.name)

def boolean_cut(target, cutter):
    m = target.modifiers.new('cut', 'BOOLEAN')
    m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    apply_mods(target)
    bpy.data.objects.remove(cutter, do_unlink=True)

def smooth_by_angle(ob, deg=35):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))
        except Exception:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(deg))

def mat(name, color, rough, metal=0.0, coat=0.0, emit=None, aniso=0.0, bump=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.02
    if aniso:
        b.inputs['Anisotropic'].default_value = aniso
    if emit:
        b.inputs['Emission Color'].default_value = (*emit[0], 1)
        b.inputs['Emission Strength'].default_value = emit[1]
    if bump:
        # fine bead-blast grain: tiny noise bump
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 2600
        nz.inputs['Detail'].default_value = 2
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
        bp.inputs['Distance'].default_value = 0.00002
        nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m

def assign(ob, m):
    ob.data.materials.clear(); ob.data.materials.append(m)

# ---------------------------------------------------------------- materials
alu   = mat('aluminium', (0.60, 0.61, 0.63), 0.28, metal=1.0, bump=0.08)
alu_d = mat('aluminium_dark', (0.30, 0.31, 0.32), 0.35, metal=1.0)
keys  = mat('keys', (0.012, 0.012, 0.013), 0.42)
glass = mat('glass', (0.004, 0.004, 0.005), 0.05, coat=0.25)
glass.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0.35
disp  = mat('display', (0.0, 0.0, 0.0), 0.04, coat=1.0)
pad   = mat('trackpad', (0.58, 0.59, 0.61), 0.42, metal=1.0)
lens  = mat('lens', (0.01, 0.012, 0.02), 0.05, coat=1.0)
floor_m = mat('floor', (0.006, 0.006, 0.007), 0.2)
floor_m.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = 0.35
rubber = mat('rubber', (0.01, 0.01, 0.01), 0.7)

# ---------------------------------------------------------------- base
base = slab('base', W, D, H, R, z0=0.0008, cy=-D / 2, bevel=0.0032, bseg=6)
apply_mods(base)
# keyboard well
u = 0.2445 / 14.5
KW, KD = 0.2445 + 0.003, 5.55 * u + 0.003
k_cy = -0.012 - KD / 2
kw = slab('kwell_cut', KW, KD, 0.01, 0.003, z0=0.0008 + H - 0.0009, cy=k_cy)
boolean_cut(base, kw)
# trackpad recess
TW, TD = 0.136, 0.084
t_cy = -D + 0.010 + TD / 2
tc = slab('tp_cut', TW + 0.0008, TD + 0.0008, 0.01, 0.0055, z0=0.0008 + H - 0.00035, cy=t_cy)
boolean_cut(base, tc)
smooth_by_angle(base, 30)
assign(base, alu)

# feet
for fx in (-W / 2 + 0.03, W / 2 - 0.03):
    for fy in (-0.025, -D + 0.025):
        f = slab('foot', 0.012, 0.012, 0.0008, 0.0059, z0=0.0, cx=fx, cy=fy)
        assign(f, rubber)

# keys
deck = 0.0008 + H
rows = [  # (height in u, [widths])
    (0.58, [1.5] + [1] * 13),
    (1, [1] * 13 + [1.5]),
    (1, [1.5] + [1] * 13),
    (1, [1.75] + [1] * 11 + [1.75]),
    (1, [2.25] + [1] * 10 + [2.25]),
    (1, [1, 1, 1, 1.25, 5.0, 1.25, 1, 1, 'ud', 1]),
]
gap = 0.0019
y = -0.012 - 0.0015
key_objs = []
def key(cx, cy, w, d):
    k = slab('key', w, d, 0.0011, min(0.0016, d / 3), z0=deck - 0.0009 + 0.00005, cx=cx, cy=cy, bevel=0.00045, bseg=3, seg=4)
    key_objs.append(k)
for (hrow, widths) in rows:
    d = hrow * u
    x = -0.2445 / 2
    for wdt in widths:
        if wdt == 'ud':
            key(x + u / 2, y - d / 4, u - gap, d / 2 - gap)
            key(x + u / 2, y - 3 * d / 4, u - gap, d / 2 - gap)
            x += u; continue
        key(x + wdt * u / 2, y - d / 2, wdt * u - gap, d - gap)
        x += wdt * u
    y -= d
for k in key_objs: apply_mods(k)
with bpy.context.temp_override(active_object=key_objs[0], selected_editable_objects=key_objs):
    bpy.ops.object.join()
keyboard = key_objs[0]; keyboard.name = 'keyboard'
assign(keyboard, keys)

# trackpad
tp = slab('trackpad', TW - 0.0004, TD - 0.0004, 0.0003, 0.0052, z0=deck - 0.00035, cy=t_cy, bevel=0.00012, bseg=2)
assign(tp, pad)

# hinge barrel
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.0047, depth=0.232, rotation=(0, math.pi / 2, 0), location=(0, -0.0035, deck + 0.0012))
hinge_bar = bpy.context.active_object; hinge_bar.name = 'hinge'
bv = hinge_bar.modifiers.new('b', 'BEVEL'); bv.width = 0.0015; bv.segments = 4
for p in hinge_bar.data.polygons: p.use_smooth = True
assign(hinge_bar, alu_d)

# ---------------------------------------------------------------- lid
pivot = bpy.data.objects.new('lid_pivot', None)
scene.collection.objects.link(pivot)
pivot.location = (0, -0.0035, deck + LT + 0.0004)
# lid modelled standing: x across, z up, thickness along +y (back), display faces -y
lid = slab('lid', W, LD, LT, R, z0=0, bevel=0.0018, bseg=5)
apply_mods(lid)
lid.data.transform(Matrix.Rotation(math.radians(90), 4, 'X'))   # rect in xz, thickness along -y..0
lid.data.transform(Matrix.Translation((0, LT, LD / 2)))         # y 0..LT, z 0..LD
smooth_by_angle(lid, 30)
assign(lid, alu)
lid.parent = pivot
# glass front
gl = slab('glass', W - 0.0034, LD - 0.0034, 0.0004, R - 0.0017, z0=0, bevel=0.0002, bseg=2)
gl.data.transform(Matrix.Rotation(math.radians(90), 4, 'X'))
gl.data.transform(Matrix.Translation((0, 0.00005, LD / 2)))
assign(gl, glass); gl.parent = pivot
# active display area (tracked for the HTML overlay)
SIDE, TOP, CHIN = 0.0075, 0.0105, 0.0185
DW, DH = W - 2 * SIDE, LD - TOP - CHIN
bm = bmesh.new()
for (x, z) in [(-DW / 2, CHIN), (DW / 2, CHIN), (DW / 2, CHIN + DH), (-DW / 2, CHIN + DH)]:
    bm.verts.new((x, -0.00037, z))
bm.faces.new(bm.verts)
dm = bpy.data.meshes.new('display'); bm.to_mesh(dm); bm.free()
display = bpy.data.objects.new('display', dm); scene.collection.objects.link(display)
assign(display, disp); display.parent = pivot
# camera dot
bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.0011, depth=0.0002, rotation=(math.pi / 2, 0, 0), location=(0, -0.0004, LD - TOP / 2))
cam_dot = bpy.context.active_object; assign(cam_dot, lens); cam_dot.parent = pivot

# ---------------------------------------------------------------- floor
bpy.ops.mesh.primitive_plane_add(size=8, location=(0, -0.1, 0))
floor = bpy.context.active_object; assign(floor, floor_m)

# ---------------------------------------------------------------- lights
def area(name, size, size_y, loc, target, power, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.shape = 'RECTANGLE'
    l.size = size; l.size_y = size_y; l.energy = power; l.color = color
    o = bpy.data.objects.new(name, l); scene.collection.objects.link(o)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    o.visible_camera = False
    return o
tgt = (0, -0.08, 0.05)
area('softbox_top', 1.4, 1.0, (0.15, -0.35, 1.3), tgt, 22)
area('strip_left', 0.14, 1.3, (-0.9, -0.45, 0.45), tgt, 16, (1, 0.98, 0.96))
area('strip_right', 0.10, 1.1, (0.95, -0.25, 0.35), tgt, 6, (0.96, 0.98, 1))
area('rim_back', 1.3, 0.12, (0, 0.85, 0.55), tgt, 14)
area('front_low', 1.2, 0.25, (0, -1.3, 0.12), tgt, 1.2)

# light linking: the studio lights only light the laptop, so the floor shows
# a clean reflection of the laptop and no hotspots from the light panels
recv = bpy.data.collections.new('laptop_receivers')
for ob in scene.collection.objects:
    if ob.type == 'MESH' and ob.name != floor.name: recv.objects.link(ob)
for ob in scene.collection.objects:
    if ob.type == 'LIGHT': ob.light_linking.receiver_collection = recv
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0, 0, 0, 1)

# ---------------------------------------------------------------- camera
cam_d = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cam_d)
scene.collection.objects.link(cam); scene.camera = cam
cam_d.sensor_fit = 'VERTICAL'; cam_d.angle = math.radians(28)
cam_d.clip_start = 0.01; cam_d.clip_end = 20
cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = 5.6

# ---------------------------------------------------------------- render settings
r = scene.render
r.engine = 'CYCLES'
r.resolution_x, r.resolution_y = args.w, args.h
r.resolution_percentage = 100
r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGB'
r.film_transparent = False
c = scene.cycles
c.samples = args.samples; c.use_adaptive_sampling = True; c.adaptive_threshold = 0.03
c.use_denoising = True; c.denoiser = 'OPENIMAGEDENOISE'
c.max_bounces = 6; c.glossy_bounces = 4; c.diffuse_bounces = 2; c.transparent_max_bounces = 4
c.caustics_reflective = False; c.caustics_refractive = False
c.device = 'CPU'
scene.view_settings.view_transform = 'AgX'
try: scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
scene.view_settings.exposure = 0.0

# ---------------------------------------------------------------- animation
def clamp(v, a, b): return max(a, min(b, v))
def ease(t): return 4 * t * t * t if t < .5 else 1 - (-2 * t + 2) ** 3 / 2
def lerp(a, b, t): return a + (b - a) * t
def vlerp(a, b, t): return a.lerp(b, t)

HINGE_CLOSED, HINGE_OPEN = math.radians(90.6), math.radians(-17)
ASPECT = args.w / args.h
TAN = math.tan(math.radians(14))

def fit(w, h, sw, sh):
    return max((h / sh) / 2 / TAN, (w / sw) / 2 / (TAN * ASPECT))

def orbit(target, dist, elev, az):
    e, a = math.radians(elev), math.radians(az)
    # az 0 = in front (-y), positive = to the right
    return target + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist

def overview(open_):
    target = Vector((0, lerp(-0.11, -0.085, open_), lerp(0.012, 0.072, open_)))
    d = fit(lerp(0.42, 0.37, open_), lerp(0.27, 0.30, open_), .74, .70)
    return orbit(target, d, lerp(44, 15, open_), lerp(-24, 0, open_)), target

def display_frame():
    bpy.context.view_layer.update()
    mw = display.matrix_world
    pts = [mw @ v.co for v in display.data.vertices]   # bl, br, tr, tl
    cen = sum(pts, Vector()) / 4
    n = (mw.to_3x3() @ Vector((0, -1, 0))).normalized()
    return pts, cen, n

def zoom_pose():
    pts, cen, n = display_frame()
    d = fit(DW, DH, .97, .92)
    return cen + n * d, cen

# one sequence: frames [0, n_open) open the lid, [n_open, n_open+n_zoom] push in.
# The page plays it forward for open+zoom-in and backwards for zoom-out.
N_OPEN, N_ZOOM = args.n_open, args.n_zoom
TOTAL = N_OPEN + N_ZOOM + 1

def pose(i):
    if i < N_OPEN:
        o = ease(i / N_OPEN); z = 0.0
    else:
        o = 1.0; z = ease((i - N_OPEN) / N_ZOOM)
    pivot.rotation_euler = (lerp(HINGE_CLOSED, HINGE_OPEN, o), 0, 0)
    bpy.context.view_layer.update()
    pa, ta = overview(o)
    pb, tb = zoom_pose()
    p = vlerp(pa, pb, z); t = vlerp(ta, tb, z)
    cam.location = p
    cam.rotation_euler = (t - p).to_track_quat('-Z', 'Y').to_euler()
    cam_d.dof.focus_distance = (t - p).length
    # slightly deeper focus when the screen fills the frame
    cam_d.dof.aperture_fstop = lerp(5.6, 11, z)
    bpy.context.view_layer.update()

if args.export:
    # real-time version: just the laptop, lid upright (the page animates the
    # hinge 'lid_pivot' itself), as glTF binary
    pivot.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    for ob in scene.collection.objects:
        if ob.type in ('MESH', 'EMPTY') and ob.name != floor.name:
            ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=args.export, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_materials='EXPORT', export_normals=True,
        export_texcoords=False, export_cameras=False, export_lights=False)
    print('exported', args.export)
    sys.exit(0)

track = []
if args.frames == 'all': frames = range(TOTAL)
else:
    a_, b_ = args.frames.split('-'); frames = range(int(a_), int(b_) + 1)

if args.blend:
    pose(N_OPEN + N_ZOOM // 2)
    bpy.ops.wm.save_as_mainfile(filepath=args.blend)

for i in range(TOTAL):
    pose(i)
    pts, cen, n = display_frame()
    q = []
    for v in [pts[3], pts[2], pts[0], pts[1]]:   # tl, tr, bl, br
        s = world_to_camera_view(scene, cam, v)
        q.append([round(s.x, 5), round(1 - s.y, 5)])
    facing = n.dot((cam.location - cen).normalized())
    track.append({'q': q, 'facing': round(facing, 4)})
with open(os.path.join(args.out, 'screen-track.json'), 'w') as f:
    json.dump({'w': args.w, 'h': args.h, 'open': N_OPEN, 'zoom': N_ZOOM, 'frames': track}, f)

if not args.track_only:
    import time
    for i in frames:
        pose(i)
        r.filepath = os.path.join(args.out, f'frame-{i:03d}.png')
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'frame {i} {time.time() - t0:.1f}s', flush=True)
