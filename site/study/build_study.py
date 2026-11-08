"""The study's props, modeled from code in Blender and exported as one GLB.

    blender --background --python site/study/build_study.py [-- --preview mac]

The module also runs from bpy in a plain Python, or inside a live Blender over MCP
for Blender, where build() rebuilds the scene and keeps the add-on loaded.

Writes public/study/study.glb and src/study/layout.json. The principal computer
is measured from the supplied Classic II photograph (evidence/LEDGER.md): one
pixel of its 904 px front face is 0.272 mm, and the numbers below come from there.
Blender's -Y is the side the camera sits on, and becomes glTF's +Z on export.
"""
import argparse
import json
import math
import os
import random
import sys

# The bpy module has to load first: it is what makes bmesh and mathutils importable.
import bpy
import bmesh
from mathutils import Matrix, Vector, geometry

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
GLB = os.path.join(SITE, 'public/study/study.glb')
LAYOUT = os.path.join(SITE, 'src/study/layout.json')
RENDERS = os.path.join(SITE, 'evidence/renders/study')

# ------------------------------------------------------------------ materials

MATERIALS = {
    # The name is how the scene finds it. Base colours are sRGB hex.
    'ivory': ('#cfcabd', 0.46, 0.0),
    'ivory_key': ('#d5d0c4', 0.42, 0.0),
    'ivory_shadow': ('#8f8778', 0.65, 0.0),
    'foot': ('#66625a', 0.7, 0.0),
    'cable': ('#b4ad9e', 0.5, 0.0),
    'black': ('#030303', 0.85, 0.0),
    'tube': ('#0c0d0f', 0.16, 0.0),
    'screen': ('#101318', 0.3, 0.0),
    'pages': ('#e7e3d8', 0.85, 0.0),
    'brass': ('#c8a45d', 0.3, 1.0),
    'brass_fabric': ('#c8a45d', 0.75, 0.0),
    'bulb': ('#fff3d6', 0.4, 0.0),
    'paper': ('#f6f7f8', 0.9, 0.0),
    'paper_edge': ('#dfe1e3', 0.95, 0.0),
    'board': ('#3a3f49', 0.68, 0.0),
    'cover_dream': ('#ffffff', 0.55, 0.0),
    'cover_hamming': ('#ffffff', 0.5, 0.0),
    'cover_everyone': ('#ffffff', 0.4, 0.0),
    # The room, from the owner's desk. The page lays wood.jpg, weave.jpg, canvas.jpg and notebook.jpg on these by name.
    'wall': ('#f1f3f5', 0.92, 0.0),
    'wood': ('#7a4a26', 0.55, 0.0),
    'weave': ('#5b3d24', 0.85, 0.0),
    'canvas_art': ('#ffffff', 0.8, 0.0),
    'notebook_page': ('#ffffff', 0.9, 0.0),
    'coil': ('#9b9da2', 0.35, 1.0),
    'cover_black': ('#1b1c20', 0.6, 0.0),
}


def linear(hex_color):
    def channel(value):
        value /= 255
        return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4

    r, g, b = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    return channel(r), channel(g), channel(b), 1.0


def material(name):
    found = bpy.data.materials.get(name)
    if found:
        return found
    color, roughness, metallic = MATERIALS[name]
    made = bpy.data.materials.new(name)
    made.use_nodes = True
    bsdf = made.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = linear(color)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return made


# ------------------------------------------------------------------ geometry

def rrect(hw, hh, r, y=0.0, cx=0.0, cz=0.0, segs=6, edge=0):
    """A rounded rectangle in the XZ plane, counter-clockwise seen from -Y. Same count for the same segs and edge, so rings loft."""
    r = min(r, hw - 1e-5, hh - 1e-5)
    points = []
    corners = ((hw - r, hh - r, 0), (r - hw, hh - r, 90), (r - hw, r - hh, 180), (hw - r, r - hh, 270))
    for index, (ax, az, start) in enumerate(corners):
        arc = []
        for i in range(segs + 1):
            a = math.radians(start + 90 * i / segs)
            arc.append(Vector((cx + ax + r * math.cos(a), y, cz + az + r * math.sin(a))))
        points += arc
        if edge:
            nx, nz, nstart = corners[(index + 1) % 4]
            a = math.radians(nstart)
            target = Vector((cx + nx + r * math.cos(a), y, cz + nz + r * math.sin(a)))
            points += [arc[-1].lerp(target, i / (edge + 1)) for i in range(1, edge + 1)]
    return points


def span(z0, z1, x0, x1, r, y=0.0, segs=6, edge=0):
    """rrect by its edges."""
    return rrect((x1 - x0) / 2, (z1 - z0) / 2, r, y, (x0 + x1) / 2, (z0 + z1) / 2, segs, edge)


def circle(center, axis, radius, count=16):
    axis = Vector(axis).normalized()
    u = axis.orthogonal().normalized()
    v = axis.cross(u)
    return [Vector(center) + (u * math.cos(2 * math.pi * i / count) + v * math.sin(2 * math.pi * i / count)) * radius for i in range(count)]


class Mesh:
    """One object: bmesh faces with a material per face."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.slots = []

    def slot(self, name):
        if name not in self.slots:
            self.slots.append(name)
        return self.slots.index(name)

    def face(self, points, mat, uvs=None, away=None):
        verts = [self.bm.verts.new(p) for p in points]
        f = self.bm.faces.new(verts)
        f.material_index = self.slot(mat)
        if uvs:
            for loop, uv in zip(f.loops, uvs):
                loop[self.uv].uv = uv
        if away is not None:
            f.normal_update()
            if f.normal.dot(Vector(away)) < 0:
                f.normal_flip()
        return f

    def loft(self, rings, mat, cap_start=False, cap_end=False, closed=True, uv=None):
        """Quads between rings of one count, sharing vertices, so normals smooth across them. Caps turn away from the ring beside them."""
        slot = self.slot(mat)
        made = [[self.bm.verts.new(p) for p in ring] for ring in rings]
        n = len(rings[0])
        for a, b in zip(made, made[1:]):
            for j in range(n if closed else n - 1):
                k = (j + 1) % n
                f = self.bm.faces.new((a[j], b[j], b[k], a[k]))
                f.material_index = slot
                if uv:
                    for loop in f.loops:
                        loop[self.uv].uv = uv(loop.vert.co)

        def cap(verts, neighbour):
            f = self.bm.faces.new(verts)
            f.material_index = slot
            f.normal_update()
            mid = sum((v.co for v in verts), Vector()) / len(verts)
            other = sum(neighbour, Vector()) / len(neighbour)
            if f.normal.dot(mid - other) < 0:
                f.normal_flip()
            if uv:
                for loop in f.loops:
                    loop[self.uv].uv = uv(loop.vert.co)

        if cap_start:
            cap(made[0], rings[1])
        if cap_end:
            cap(made[-1], rings[-2])
        return made

    def fan(self, ring, center, mat, uv=None):
        """Closes a ring to a point: smoother than an n-gon on a curved surface."""
        slot = self.slot(mat)
        made = [self.bm.verts.new(p) for p in ring]
        hub = self.bm.verts.new(center)
        n = len(ring)
        for j in range(n):
            f = self.bm.faces.new((made[j], made[(j + 1) % n], hub))
            f.material_index = slot
            if uv:
                for loop in f.loops:
                    loop[self.uv].uv = uv(loop.vert.co)

    def tube(self, path, radius, mat, count=8):
        """A round wire along a polyline, with parallel-transported frames."""
        rings = []
        tangent = (path[1] - path[0]).normalized()
        u = tangent.orthogonal().normalized()
        for i, p in enumerate(path):
            nxt = path[min(i + 1, len(path) - 1)]
            prv = path[max(i - 1, 0)]
            t = (nxt - prv).normalized()
            u = (u - t * u.dot(t)).normalized()
            v = t.cross(u)
            rad = radius(i / (len(path) - 1)) if callable(radius) else radius
            rings.append([p + (u * math.cos(2 * math.pi * j / count) + v * math.sin(2 * math.pi * j / count)) * rad for j in range(count)])
        self.loft(rings, mat, cap_start=True, cap_end=True)

    def finish(self, matrix=None, sharp=38, parent=None, shear=None):
        bm = self.bm
        if shear:
            for v in bm.verts:
                shear(v.co)
        bm.normal_update()
        mesh = bpy.data.meshes.new(self.name)
        bm.to_mesh(mesh)
        bm.free()
        for name in self.slots:
            mesh.materials.append(material(name))
        mesh.shade_smooth()
        mesh.set_sharp_from_angle(angle=math.radians(sharp))
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        if matrix is not None:
            obj.matrix_world = matrix
        if parent is not None:
            obj.parent = parent
        return obj


def at(x, y, z=0.0, turn=0.0):
    """A placement: a point on the desk and a turn about the vertical, in degrees."""
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(turn), 4, 'Z')


def bezier(p0, p1, p2, p3, count):
    return [Vector(geometry.interpolate_bezier(p0, p1, p2, p3, count)[i]) for i in range(count)]


def smooth_curve(points, per=16):
    """Catmull-Rom through points."""
    pts = [Vector(p) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        for s in range(per):
            t = s / per
            out.append(0.5 * ((2 * p1) + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t))
    out.append(pts[-1])
    return out


# ------------------------------------------------------------------ the computer

W = 0.123  # half the 246 mm width
TOP = 0.328
FOOT = 0.032
CHIN = 0.0885  # the seam between the upper face and the lower panel
DEPTH = 0.284
FRONT = -DEPTH / 2
LEAN = math.tan(math.radians(3.0))  # The face leans back a little.

# From the photograph, in metres about the machine's centre line.
RECESS = dict(x0=-0.1015, x1=0.1015, z0=0.1327, z1=0.2973, r=0.0095)
TUBE = dict(x0=-0.0935, x1=0.0935, z0=0.1458, z1=0.2853, r=0.0075)
# The picture fills the glass to a thin black edge, centred on it, at the app's own
# proportions (1014 x 732), so the film and the live app keep their size in pixels.
RASTER = dict(hw=0.0912, hh=0.06584, cz=(TUBE['z0'] + TUBE['z1']) / 2, r=0.0055)
RECESS_DEPTH = 0.021
# A compact Mac's tube is a shallow dome: about a centimetre proud of its edge at the middle.
BULGE = 0.010


def lean(co):
    co.y += (co.z - FOOT) * LEAN


def tube_y(x, z):
    """The glass bows toward the viewer."""
    cx, cz = 0.0, (TUBE['z0'] + TUBE['z1']) / 2
    hw, hh = TUBE['x1'], (TUBE['z1'] - TUBE['z0']) / 2
    nx, nz = min(abs(x - cx) / hw, 1), min(abs(z - cz) / hh, 1)
    return FRONT + RECESS_DEPTH - BULGE * (1 - nx * nx) * (1 - nz * nz)


def on_glass(ring):
    return [Vector((p.x, tube_y(p.x, p.z), p.z)) for p in ring]


def raster_edge_depth():
    """How far the raster's edge lies behind its centre on the bowed glass, averaged along the edge: where the live app's flat plane meets the glass."""
    r = RASTER
    ring = rrect(r['hw'], r['hh'], r['r'], 0, 0, r['cz'], segs=24, edge=48)
    centre = tube_y(0, r['cz'])
    total = length = 0.0
    for a, b in zip(ring, ring[1:] + ring[:1]):
        step = (b - a).length
        middle = a.lerp(b, 0.5)
        total += (tube_y(middle.x, middle.z) - centre) * step
        length += step
    return total / length


def build_computer(root):
    body = Mesh('Mac')

    # The front face and the shell, one run of rings from the lip of the tube to the back.
    def full(inset=0.0, y=0.0, r=0.009, top=TOP, bottom=FOOT, hw=W):
        return span(bottom + inset, top - inset, -hw + inset, hw - inset, r, FRONT + y)

    t = TUBE
    rc = RECESS
    rings = [
        span(t['z0'], t['z1'], t['x0'], t['x1'], t['r'], tube_y(t['x1'], t['z0'])),
        span(t['z0'] - 0.0006, t['z1'] + 0.0006, t['x0'] - 0.0006, t['x1'] + 0.0006, t['r'] + 0.0005, FRONT + RECESS_DEPTH - 0.0008),
        span(rc['z0'] + 0.0012, rc['z1'] - 0.0012, rc['x0'] + 0.0012, rc['x1'] - 0.0012, rc['r'], FRONT + 0.0014),
        span(rc['z0'] - 0.0004, rc['z1'] + 0.0004, rc['x0'] - 0.0004, rc['x1'] + 0.0004, rc['r'] + 0.0012, FRONT + 0.0002),
        span(rc['z0'] - 0.002, rc['z1'] + 0.002, rc['x0'] - 0.002, rc['x1'] + 0.002, rc['r'] + 0.002, FRONT),
        # The face runs out to a broad soft edge, which is what gives the photo its tray.
        full(0.013, 0.0, 0.010),
        full(0.006, 0.0009, 0.009),
        full(0.002, 0.0028, 0.009),
        full(0.0006, 0.0052, 0.0095),
        full(0.0, 0.0085, 0.010),
        full(0.0, 0.070, 0.011),
        # The seam between the bezel and the back of the case.
        full(0.0, 0.0795, 0.011),
        full(0.0016, 0.0802, 0.011),
        full(0.0016, 0.0822, 0.011),
        span(FOOT + 0.0008, TOP - 0.0012, -W + 0.0008, W - 0.0008, 0.012, FRONT + 0.0832),
        span(FOOT + 0.0012, TOP - 0.0030, -W + 0.0020, W - 0.0020, 0.013, FRONT + 0.092),
        # The back shell draws in toward the rear.
        span(FOOT + 0.002, TOP - 0.010, -W + 0.006, W - 0.006, 0.016, FRONT + 0.150),
        span(FOOT + 0.003, TOP - 0.022, -W + 0.012, W - 0.012, 0.020, FRONT + 0.225),
        span(FOOT + 0.004, TOP - 0.032, -W + 0.017, W - 0.017, 0.024, FRONT + DEPTH - 0.012),
        span(FOOT + 0.007, TOP - 0.036, -W + 0.021, W - 0.021, 0.024, FRONT + DEPTH - 0.003),
        span(FOOT + 0.013, TOP - 0.042, -W + 0.027, W - 0.027, 0.022, FRONT + DEPTH),
    ]
    body.loft(rings, 'ivory', cap_end=True)

    # The lower panel sits proud of the face, so the seam is a real step that throws a line.
    panel_r = 0.006
    body.loft(
        [
            span(FOOT + 0.002, CHIN - 0.0028, -W + 0.0022, W - 0.0022, panel_r, FRONT - 0.0017),
            span(FOOT + 0.0008, CHIN - 0.0010, -W + 0.0008, W - 0.0008, panel_r, FRONT - 0.0012),
            span(FOOT, CHIN - 0.0002, -W + 0.0001, W - 0.0001, panel_r, FRONT - 0.0004),
            span(FOOT, CHIN - 0.0002, -W + 0.0001, W - 0.0001, panel_r, FRONT + 0.012),
        ],
        'ivory',
        cap_start=True,
    )
    # The shadow line in the seam.
    body.face(
        [
            Vector((-W + 0.002, FRONT - 0.00015, CHIN - 0.0002)),
            Vector((W - 0.002, FRONT - 0.00015, CHIN - 0.0002)),
            Vector((W - 0.002, FRONT - 0.00015, CHIN + 0.0009)),
            Vector((-W + 0.002, FRONT - 0.00015, CHIN + 0.0009)),
        ],
        'ivory_shadow',
    )

    # The drive slot and its lamp, on the panel. The slot's top edge meets the seam, as in the photo.
    slot = dict(x0=-0.0033, x1=0.0925, z0=CHIN - 0.0072, z1=CHIN - 0.0010)
    y = FRONT - 0.0019
    body.face(span(slot['z0'], slot['z1'], slot['x0'], slot['x1'], 0.0004, y, segs=2), 'black', away=(0, -1, 0))
    body.face(circle((0.0985, y, CHIN - 0.0042), (0, 1, 0), 0.0009, 12), 'black', away=(0, -1, 0))

    # The foot, barely inside the case and much darker than it.
    body.loft(
        [
            span(0.0, FOOT + 0.002, -W + 0.003, W - 0.003, 0.004, FRONT + 0.0015),
            span(0.0, FOOT + 0.002, -W + 0.016, W - 0.016, 0.012, FRONT + DEPTH - 0.012),
        ],
        'foot',
        cap_start=True,
        cap_end=True,
    )

    # Vents on top of the back shell and down its sides. Dark strips laid on the surface.
    for i in range(16):
        y0 = FRONT + 0.128 + i * 0.0072
        slope = (y0 - (FRONT + 0.092)) / (0.150 - 0.092) * 0.007
        z = TOP - 0.0030 - slope + 0.0004 if y0 < FRONT + 0.150 else TOP - 0.010 - (y0 - (FRONT + 0.150)) / 0.075 * 0.012 + 0.0004
        hw = 0.078 - i * 0.0012
        body.face(
            [
                Vector((-hw, y0, z)),
                Vector((hw, y0, z)),
                Vector((hw, y0 + 0.0029, z - 0.0004)),
                Vector((-hw, y0 + 0.0029, z - 0.0004)),
            ],
            'ivory_shadow',
        )
    computer = body.finish(parent=root, shear=lean)

    # The tube: a glossy dark border and the raster inside it, both on the bowed glass.
    # The border starts a little under the raster, so no crack opens between the raster's
    # faceted corners and the border's round ones for the room behind to show through.
    glass = Mesh('Tube')
    r = RASTER
    under = 0.0008
    ring_under = rrect(r['hw'] - under, r['hh'] - under, r['r'] - under, 0, 0, r['cz'], edge=14)
    ring_raster = rrect(r['hw'], r['hh'], r['r'], 0, 0, r['cz'], edge=14)
    ring_tube = span(t['z0'], t['z1'], t['x0'], t['x1'], t['r'], 0, edge=14)
    steps = [ring_under, ring_raster] + [[a.lerp(b, s) for a, b in zip(ring_raster, ring_tube)] for s in (0.34, 0.67, 1.0)]
    glass.loft([on_glass(ring) for ring in steps], 'tube')
    glass.finish(parent=root, shear=lean, sharp=80)

    # The raster: a grid over the bowed glass with its corners pulled onto their arcs, so a video reads undistorted.
    screen = Mesh('Screen')
    slot = screen.slot('screen')
    columns, rows = 88, 64
    verts = []
    for j in range(rows + 1):
        row = []
        for i in range(columns + 1):
            x = -r['hw'] + 2 * r['hw'] * i / columns
            z = r['cz'] - r['hh'] + 2 * r['hh'] * j / rows
            ox, oz = abs(x) - (r['hw'] - r['r']), abs(z - r['cz']) - (r['hh'] - r['r'])
            if ox > 0 and oz > 0 and math.hypot(ox, oz) > r['r']:
                scale = r['r'] / math.hypot(ox, oz)
                x = math.copysign(r['hw'] - r['r'] + ox * scale, x)
                z = r['cz'] + math.copysign(r['hh'] - r['r'] + oz * scale, z - r['cz'])
            row.append(screen.bm.verts.new((x, tube_y(x, z) - 0.0002, z)))
        verts.append(row)
    for j in range(rows):
        for i in range(columns):
            f = screen.bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
            f.material_index = slot
            for loop in f.loops:
                co = loop.vert.co
                loop[screen.uv].uv = ((co.x + r['hw']) / (2 * r['hw']), (co.z - (r['cz'] - r['hh'])) / (2 * r['hh']))
    screen.finish(parent=root, shear=lean, sharp=89)
    center = Vector((0, tube_y(0, r['cz']) - 0.0002, r['cz']))

    # Where the camera arrives: the centre of the raster, after the lean.
    centre = center.copy()
    lean(centre)
    normal = Vector((0, -1, LEAN)).normalized()
    return computer, centre, normal


# ------------------------------------------------------------------ keyboard, mouse, cables

KB_W, KB_D = 0.206, 0.069  # half sizes
KB_FRONT_H, KB_BACK_H = 0.0165, 0.038
KB_SLOPE = (KB_BACK_H - KB_FRONT_H) / (2 * KB_D)
KEY = 0.01905  # The standard pitch.


def kb_top(y):
    return KB_FRONT_H + (y + KB_D) * KB_SLOPE


def keycap(mesh, x, y, width, depth):
    """A cap on the keyboard's slope: a rounded frustum, its top dished by a smaller ring."""
    base = kb_top(y)

    def ring(inset, z, r):
        points = rrect(width / 2 - inset, depth / 2 - inset, r, 0, 0, 0, segs=2)
        return [Vector((x + p.x, y + p.z, base + z + p.z * KB_SLOPE)) for p in points]

    top = ring(0.0034, 0.0058, 0.0014)
    mesh.loft(
        [ring(0.00035, -0.0036, 0.0010), ring(0.0013, 0.0040, 0.0016), ring(0.0023, 0.0060, 0.0017), top],
        'ivory_key',
    )
    mesh.fan(top, sum(top, Vector()) / len(top) - Vector((0, 0, 0.0002)), 'ivory_key')


def build_keyboard(root, matrix):
    mesh = Mesh('Keyboard')
    w, d = KB_W, KB_D
    u = KEY
    # The well runs the width of the keys. There is a broad lip in front of it and a narrow one behind.
    well_w = (15 + 1.15 + 4.15) * u / 2 + 0.0012
    well_y0 = -d + 0.0285
    well_y1 = well_y0 + 5 * u + 0.0022
    well_cy = (well_y0 + well_y1) / 2
    well_hd = (well_y1 - well_y0) / 2

    def on_slope(points, z_extra):
        return [Vector((p.x, p.z, z_extra + kb_top(p.z))) for p in points]

    def plate(inset, z_extra, r):
        return on_slope(rrect(w - inset, d - inset, r, 0, 0, 0), z_extra)

    def well(inset, z_extra):
        return on_slope(rrect(well_w + inset, well_hd + inset, 0.0028 + max(inset, 0), 0, 0, well_cy), z_extra)

    bottom = [Vector((p.x, p.z, 0.0005)) for p in rrect(w - 0.002, d - 0.002, 0.009, 0, 0, 0)]
    low = [Vector((p.x, p.z, 0.0045)) for p in rrect(w, d, 0.0095, 0, 0, 0)]
    mesh.loft(
        [
            bottom,
            low,
            plate(0.0, -0.0028, 0.009),
            plate(0.0006, -0.0008, 0.0085),
            plate(0.0020, -0.0001, 0.008),
            plate(0.0040, 0.0, 0.0075),
            well(0.0016, 0.0),
            well(0.0004, -0.0004),
        ],
        'ivory',
        cap_start=True,
    )
    mesh.loft([well(0.0004, -0.0004), well(-0.0003, -0.0050)], 'ivory_shadow', cap_end=True)

    left = -well_w + 0.0012
    top_y = well_y1 - 0.0011 - u / 2
    rows = [
        [1] * 13 + [2],
        [1.5] + [1] * 12 + [1.5],
        [1.75] + [1] * 11 + [2.25],
        [2.25] + [1] * 10 + [1.75, 1],
        [1, 1.15, 1.75, 7.1, 1, 1, 1, 1],
    ]
    for r, row in enumerate(rows):
        x = left
        y = top_y - r * u
        for units in row:
            keycap(mesh, x + units * u / 2, y, units * u, u)
            x += units * u
    # The tall blank bar between the keys and the number pad.
    bar_x = left + 15 * u + 0.575 * u
    keycap(mesh, bar_x, top_y - 2 * u, 1.0 * u, 5 * u)
    pad_x = left + 16.15 * u
    pad = [(0, 0, 1, 1), (1, 0, 1, 1), (2, 0, 1, 1), (3, 0, 1, 1), (0, 1, 1, 1), (1, 1, 1, 1), (2, 1, 1, 1), (3, 1, 1, 1),
           (0, 2, 1, 1), (1, 2, 1, 1), (2, 2, 1, 1), (3, 2, 1, 1), (0, 3, 1, 1), (1, 3, 1, 1), (2, 3, 1, 1), (3, 3, 1, 2),
           (0, 4, 2, 1), (2, 4, 1, 1)]
    for cx, cy, cw, ch in pad:
        keycap(mesh, pad_x + (cx + cw / 2) * u, top_y - (cy + (ch - 1) / 2) * u, cw * u, ch * u)

    # The low raised strip along the back edge.
    strip = lambda inset, z: on_slope(rrect(0.150 - inset, 0.0050 - inset, 0.0016, 0, 0.002, d - 0.0072), z)
    mesh.loft([strip(0.0, -0.0003), strip(0.0, 0.0012), strip(0.0009, 0.0019)], 'ivory', cap_end=True)
    return mesh.finish(matrix=matrix, parent=root, sharp=46)


MOUSE_L = 0.106
MOUSE_W = 0.031


def mouse_plan(y):
    """Half the width at y: a rounded rectangle in plan, from a superellipse."""
    t = min(abs(y) / (MOUSE_L / 2), 1.0)
    return MOUSE_W * (1 - t ** 7) ** (1 / 7)


def mouse_section(y, hw, crease, h):
    """Across the mouse at y: a straight skirt to the parting line, a shadow groove, then the shell's sides into a low crown."""
    shoulder = min(0.0085, hw * 0.4)
    half = [
        (hw - 0.0011, 0.0),
        (hw - 0.0002, 0.0011),
        (hw, 0.0024),
        (hw, crease - 0.0005),
        (hw - 0.0007, crease - 0.0001),
        (hw - 0.0007, crease + 0.0002),
        (hw - 0.0001, crease + 0.0008),
        (hw - 0.0001, crease + (h - crease) * 0.42),
        (hw - shoulder * 0.16, h - (h - crease) * 0.26),
        (hw - shoulder * 0.48, h - 0.0011),
        (hw - shoulder, h - 0.0001),
    ]
    inner = hw - shoulder
    half += [(inner * (1 - i / 3), h + 0.0007 * math.sin(math.pi / 2 * i / 3)) for i in range(1, 3)]
    points = half + [(0.0, h + 0.0007)] + [(-x, z) for x, z in reversed(half)]
    return [Vector((x, y, max(z, 0.0))) for x, z in points]


def mouse_height(y):
    """The first ADB mouse from the photo: tallest and flat at the cord end (+Y), a long fall toward the palm, and a chamfer at the palm end."""
    u = (y + MOUSE_L / 2) / MOUSE_L
    crease = 0.0100 + 0.0040 * u
    if u < 0.16:
        # The palm end's chamfer, from the parting line up to the top plane.
        s = u / 0.16
        top = crease + 0.0015 + (0.0218 - crease - 0.0015) * math.sin(math.pi / 2 * s)
    elif u < 0.86:
        top = 0.0218 + (0.0262 - 0.0218) * (u - 0.16) / 0.70
    else:
        # The cord end rounds over into a nearly upright face.
        s = (u - 0.86) / 0.14
        top = 0.0262 - 0.0062 * s ** 2.4
    return crease, top


def build_mouse(root, matrix):
    """The photo's mouse, the first ADB mouse: a low box with straight sides, a shell over a parting line, and a button plate at the cord end."""
    mesh = Mesh('Mouse')
    half = MOUSE_L / 2
    # Close together at the ends, where the plan turns its corners.
    ts = [-1.0, -0.995, -0.98, -0.95, -0.90, -0.84, -0.76, -0.66, -0.5, -0.3, -0.1, 0.1, 0.3, 0.5, 0.66, 0.76, 0.84, 0.90, 0.95, 0.98, 0.995, 1.0]
    rings = []
    for t in ts:
        y = t * half
        crease, top = mouse_height(y)
        hw = max(mouse_plan(y * 0.9999), 0.62 * MOUSE_W)
        rings.append(mouse_section(y, hw, crease, top))
    mesh.loft(rings, 'ivory', cap_start=True, cap_end=True)

    # The button's seam: a dark line across the top shell, a third of the way back from the cord end.
    y = half - 0.036
    crease, top = mouse_height(y)
    ring = mouse_section(y, mouse_plan(y), crease, top)
    across = [p for p in ring if p.z > top - 0.0030]
    for a, b in zip(across, across[1:]):
        lift = Vector((0, 0, 0.00018))
        mesh.face([a + lift, b + lift, b + lift + Vector((0, 0.0007, 0)), a + lift + Vector((0, 0.0007, 0))], 'ivory_shadow', away=(0, 0, 1))
    return mesh.finish(matrix=matrix, parent=root, sharp=40)


def build_cables(root, keyboard, mouse, computer_matrix):
    mesh = Mesh('Cables')
    kb = keyboard.matrix_world
    mo = mouse.matrix_world
    mac = computer_matrix
    radius = 0.0016

    # The mouse's cord runs from its button end, wanders on the desk, and goes in behind the keyboard's right end.
    start = mo @ Vector((0, 0.053, 0.008))
    end = kb @ Vector((KB_W - 0.012, KB_D + 0.001, 0.028))
    path = smooth_curve(
        [start, start + Vector((-0.010, 0.030, -0.005)), start + Vector((0.040, 0.100, -0.006)), end + Vector((0.070, 0.050, -0.024)), end + Vector((0.020, 0.018, -0.020)), end],
        per=14,
    )
    mesh.tube([Vector((p.x, p.y, max(p.z, radius))) for p in path], radius, 'cable', count=7)

    # The keyboard's coiled cord, from its left end around to the back of the computer.
    start = kb @ Vector((-KB_W + 0.014, KB_D + 0.001, 0.028))
    end = mac @ Vector((-W + 0.03, FRONT + 0.20, 0.03))
    spine = smooth_curve(
        [start, start + Vector((-0.030, 0.040, -0.018)), start + Vector((-0.060, 0.120, -0.022)), end + Vector((-0.045, -0.020, -0.022)), end + Vector((-0.012, 0.0, -0.022))],
        per=40,
    )
    # A helix around that spine.
    lengths = [0.0]
    for a, b in zip(spine, spine[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    coil_radius = 0.0048
    pitch = 0.0052
    helix = []
    samples = int(lengths[-1] / pitch * 10)
    index = 0
    for i in range(samples + 1):
        s = lengths[-1] * i / samples
        while index < len(lengths) - 2 and lengths[index + 1] < s:
            index += 1
        t = (s - lengths[index]) / max(lengths[index + 1] - lengths[index], 1e-6)
        p = spine[index].lerp(spine[index + 1], t)
        tangent = (spine[index + 1] - spine[index]).normalized()
        u = tangent.cross(Vector((0, 0, 1))).normalized()
        v = tangent.cross(u)
        a = 2 * math.pi * s / pitch
        q = p + u * math.cos(a) * coil_radius + v * math.sin(a) * coil_radius
        q.z = max(q.z, 0.0014)
        helix.append(q)
    mesh.tube(helix, 0.00115, 'cable', count=5)
    return mesh.finish(parent=root, sharp=89)


# ------------------------------------------------------------------ books

# Trim in metres. This Is for Everyone is the published 234.9 x 162.6 x 33.0 mm, the Hamming the listed 9.2 x 6.2 in; the Waldrop is measured from its listing's proportions.
BOOKS = {
    'dream': dict(w=0.153, h=0.229, t=0.043, cover='cover_dream'),
    'hamming': dict(w=0.1575, h=0.2337, t=0.035, cover='cover_hamming'),
    'everyone': dict(w=0.1626, h=0.2349, t=0.033, cover='cover_everyone'),
}
BOARD = 0.0026


def build_book(root, key, matrix):
    """A hardcover from a swept C section: boards, a French groove and a rounded spine.
    Its outside unwraps back cover, spine, front cover, left to right, head at the top, like a flat jacket."""
    book = BOOKS[key]
    w, h, t = book['w'], book['h'], book['t']
    mesh = Mesh('Book_' + key)
    bulge = 0.0028
    hinge = 0.0115
    outer = [(w, 0.0)]
    # Along the back cover to the groove.
    outer += [(hinge + 0.0035, 0.0), (hinge + 0.0016, 0.0009), (hinge, 0.0013), (hinge - 0.0016, 0.0009), (hinge - 0.0035, 0.0)]
    spine_start = len(outer)
    # Around the spine, a shallow arc with tight shoulders.
    for i in range(1, 12):
        a = i / 12
        outer.append((0.0030 - 0.0030 * math.sin(math.pi * min(a * 6, 1) / 2) - bulge * math.sin(math.pi * a), t * (0.5 - 0.5 * math.cos(math.pi * a))))
    outer.append((0.0030, t))
    spine_end = len(outer) - 1
    outer += [(hinge - 0.0035, t), (hinge - 0.0016, t - 0.0009), (hinge, t - 0.0013), (hinge + 0.0016, t - 0.0009), (hinge + 0.0035, t), (w, t)]

    arc = [0.0]
    for a, b in zip(outer, outer[1:]):
        arc.append(arc[-1] + math.dist(a, b))
    total = arc[-1]
    us = [s / total for s in arc]
    rec = dict(
        u_back=[us[0], us[spine_start]],
        u_spine=[us[spine_start], us[spine_end]],
        u_front=[us[spine_end], us[-1]],
        width=total,
        height=h,
    )

    # The outside: one strip along the sweep.
    a = [mesh.bm.verts.new((x, 0, z)) for x, z in outer]
    b = [mesh.bm.verts.new((x, h, z)) for x, z in outer]
    slot = mesh.slot(book['cover'])
    for j in range(len(outer) - 1):
        # Winding: seen from outside the strip.
        f = mesh.bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
        f.material_index = slot
        for loop in f.loops:
            co = loop.vert.co
            index = j if (abs(co.x - outer[j][0]) < 1e-7 and abs(co.z - outer[j][1]) < 1e-7) else j + 1
            loop[mesh.uv].uv = (us[index], co.y / h)
    # The inside and the board edges, in the cover's colour at its edge.
    edge = (0.002, 0.5)
    inner = [(w, BOARD), (0.0075, BOARD), (0.0075, t - BOARD), (w, t - BOARD)]
    ia = [mesh.bm.verts.new((x, 0, z)) for x, z in inner]
    ib = [mesh.bm.verts.new((x, h, z)) for x, z in inner]
    for j in range(3):
        f = mesh.bm.faces.new((ia[j + 1], ia[j], ib[j], ib[j + 1]))
        f.material_index = slot
        for loop in f.loops:
            loop[mesh.uv].uv = edge
    for pair in ((a[0], b[0], ib[0], ia[0]), (a[-1], ia[-1], ib[-1], b[-1])):
        f = mesh.bm.faces.new(pair)
        f.material_index = slot
        for loop in f.loops:
            loop[mesh.uv].uv = edge
    # The two ends of the sweep, thin edges of board and the spine's section.
    polygon = outer + list(reversed(inner))
    for y, flip in ((0.0, False), (h, True)):
        loop3 = [Vector((x, y, z)) for x, z in polygon]
        tris = geometry.tessellate_polygon([[Vector((x, z, 0)) for x, z in polygon]])
        for tri in tris:
            pts = [loop3[i] for i in tri]
            area = (pts[1] - pts[0]).cross(pts[2] - pts[0]).y
            if (area > 0) != flip:
                pts = [pts[0], pts[2], pts[1]]
            f = mesh.face(pts, book['cover'], [edge, edge, edge])

    # The text block, set in from the boards, with its fore edge a touch hollow.
    x0, x1 = 0.0072, w - 0.0034
    y0, y1 = 0.0028, h - 0.0028
    z0, z1 = BOARD, t - BOARD
    rows = 6
    hollow = 0.0016
    fore = lambda z: x1 - hollow * (1 - ((z - z0) / (z1 - z0) * 2 - 1) ** 2)
    pages_uv = lambda u, v: (u, v)

    def page_face(points, uvs):
        mesh.face(points, 'pages', uvs)

    for i in range(rows):
        za = z0 + (z1 - z0) * i / rows
        zb = z0 + (z1 - z0) * (i + 1) / rows
        va, vb = i / rows, (i + 1) / rows
        length = (y1 - y0) / 0.24
        # Fore edge
        page_face(
            [Vector((fore(za), y0, za)), Vector((fore(za), y1, za)), Vector((fore(zb), y1, zb)), Vector((fore(zb), y0, zb))],
            [(0, va), (length, va), (length, vb), (0, vb)],
        )
        depth = (x1 - x0) / 0.24
        # Tail
        page_face(
            [Vector((x0, y0, za)), Vector((fore(za), y0, za)), Vector((fore(zb), y0, zb)), Vector((x0, y0, zb))],
            [(0, va), (depth, va), (depth, vb), (0, vb)],
        )
        # Head
        page_face(
            [Vector((fore(za), y1, za)), Vector((x0, y1, za)), Vector((x0, y1, zb)), Vector((fore(zb), y1, zb))],
            [(depth, va), (0, va), (0, vb), (depth, vb)],
        )
    obj = mesh.finish(matrix=matrix, parent=root, sharp=33)
    return obj, rec


def build_ribbon(root, matrix, drop):
    """Brass ribbon marker: out of the tail of the Hamming and down onto the desk."""
    mesh = Mesh('Ribbon')
    points = smooth_curve(
        [(0.070, 0.0035, 0.018), (0.072, -0.004, 0.0165), (0.075, -0.012, 0.004), (0.078, -0.017, -drop * 0.55), (0.082, -0.022, -drop + 0.0025), (0.090, -0.040, -drop + 0.0006), (0.096, -0.066, -drop + 0.0005), (0.094, -0.082, -drop + 0.0005)],
        per=8,
    )
    half = 0.0034
    rings_a, rings_b = [], []
    for p in points:
        rings_a.append(p + Vector((-half, 0, 0)))
        rings_b.append(p + Vector((half, 0, 0)))
    made_a = [mesh.bm.verts.new(p) for p in rings_a]
    made_b = [mesh.bm.verts.new(p) for p in rings_b]
    slot = mesh.slot('brass_fabric')
    for i in range(len(points) - 1):
        f = mesh.bm.faces.new((made_a[i], made_b[i], made_b[i + 1], made_a[i + 1]))
        f.material_index = slot
    return mesh.finish(matrix=matrix, parent=root, sharp=89)


# ------------------------------------------------------------------ lamp, paper

def build_lamp(root, base, head, aim):
    """A small brass task lamp. Returns where its light sits and where it points, for the scene."""
    mesh = Mesh('Lamp')
    bx, by = base
    n = 40
    disc = lambda r, z: circle((bx, by, z), (0, 0, 1), r, n)
    mesh.loft([disc(0.070, 0.0), disc(0.0735, 0.003), disc(0.0735, 0.0085), disc(0.0705, 0.0125), disc(0.040, 0.0165), disc(0.016, 0.0185)], 'brass', cap_start=True, cap_end=True)
    elbow = Vector((bx + 0.012, by + 0.040, 0.292))
    head_at = Vector(head)
    root_at = Vector((bx, by, 0.018))
    mesh.tube([root_at.lerp(elbow, i / 8) for i in range(9)], 0.0042, 'brass', count=12)
    mesh.tube([elbow.lerp(head_at, i / 8) for i in range(9)], 0.0036, 'brass', count=12)
    for joint, r in ((elbow, 0.0082), (head_at, 0.0078)):
        rings = [circle(joint + Vector((0, 0, r * math.cos(math.pi * i / 8))), (0, 0, 1), max(r * math.sin(math.pi * i / 8), 1e-4), 14) for i in range(1, 8)]
        mesh.loft(rings, 'brass', cap_start=True, cap_end=True)
    axis = (Vector(aim) - head_at).normalized()
    # The shade, a spun cone: both sides, lit from within.
    apex = head_at + axis * 0.012
    stations = [(0.0, 0.0150), (0.011, 0.0190), (0.035, 0.0300), (0.064, 0.0445), (0.080, 0.0520), (0.0822, 0.0520), (0.0822, 0.0502), (0.076, 0.0476), (0.035, 0.0268), (0.011, 0.0165)]
    rings = [circle(apex + axis * d, axis, r, 40) for d, r in stations]
    mesh.loft(rings, 'brass', cap_start=True, cap_end=True)
    finished = mesh.finish(parent=root, sharp=40)
    bulb = Mesh('Bulb')
    centre = apex + axis * 0.042
    rings = [circle(centre + axis * (0.018 * math.cos(math.pi * i / 10)), axis, max(0.018 * math.sin(math.pi * i / 10), 1e-4), 18) for i in range(1, 10)]
    bulb.loft(rings, 'bulb', cap_start=True, cap_end=True)
    bulb.finish(parent=root, sharp=89)
    return finished, apex + axis * 0.07, Vector(aim)


def build_pen(root, matrix):
    mesh = Mesh('Pen')
    length = 0.138
    stations = [(0.0, 0.00015), (0.002, 0.0006), (0.016, 0.0034), (0.030, 0.0042), (0.104, 0.0042), (0.1055, 0.0046), (0.108, 0.0046), (0.1095, 0.0042), (length - 0.002, 0.0040), (length, 0.0012)]
    rings = [circle((0, y, 0.0043), (0, 1, 0), r, 20) for y, r in stations]
    mesh.loft(rings, 'brass', cap_start=True, cap_end=True)
    return mesh.finish(matrix=matrix, parent=root, sharp=40)


# The two surfaces the page's panels lie on. Each is sized to its panel at a whole
# number of CSS pixels per metre, so the DOM drawn on it is the panel at scale 1.
SURFACES = {
    # Possibilities: a card on a slate board beside the books, the working surface.
    'possibilities': dict(css=(1040, 650), px_per_m=3250.0),
    # Join: a top-bound pad, the nearby writing surface.
    'join': dict(css=(760, 500), px_per_m=3040.0),
}


def surface_size(key):
    spec = SURFACES[key]
    return spec['css'][0] / spec['px_per_m'], spec['css'][1] / spec['px_per_m']


def rounded_slab(mesh, hw, hh, r, z0, z1, mat, segs=4):
    """A flat slab with rounded corners in plan, z0 to z1."""
    ring = rrect(hw, hh, r, 0.0, 0.0, 0.0, segs=segs)
    bottom = [Vector((p.x, p.z, z0)) for p in ring]
    top = [Vector((p.x, p.z, z1)) for p in ring]
    mesh.loft([bottom, top], mat, cap_start=True, cap_end=True)


def build_working(root, matrix):
    """The card the examples are written on, on a slate board, with two loose sheets under it. Returns the card's top height."""
    w, h = surface_size('possibilities')
    mesh = Mesh('Working')
    board = 0.004
    rounded_slab(mesh, w / 2 + 0.014, h / 2 + 0.014, 0.006, 0.0, board, 'board')
    rng = random.Random(11)
    z = board
    for i in range(2):
        turn = math.radians(rng.uniform(-1.4, 1.4))
        c, s_ = math.cos(turn), math.sin(turn)
        dx, dy = rng.uniform(-0.004, 0.004), rng.uniform(-0.004, 0.004)
        corners = [(-w / 2 + 0.003, -h / 2 + 0.003), (w / 2 - 0.003, -h / 2 + 0.003), (w / 2 - 0.003, h / 2 - 0.003), (-w / 2 + 0.003, h / 2 - 0.003)]
        top = [Vector((dx + x * c - y * s_, dy + x * s_ + y * c, z + 0.00035)) for x, y in corners]
        mesh.face(top, 'paper_edge', [(0, 0)] * 4)
        z += 0.00035
    # The card itself, square to the board: its top face carries the panel, UVs top-left first.
    card = 0.0006
    corners = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]
    top = [Vector((x, y, z + card)) for x, y in corners]
    bottom = [Vector((x, y, z)) for x, y in corners]
    mesh.face(top, 'paper', [(0, 1), (1, 1), (1, 0), (0, 0)])
    for j in range(4):
        k = (j + 1) % 4
        mesh.face([bottom[j], bottom[k], top[k], top[j]], 'paper_edge', [(0, 0)] * 4)
    mesh.finish(matrix=matrix, parent=root, sharp=30)
    return z + card


def build_pad(root, matrix):
    """A top-bound pad: a block of sheets under a cloth binding along the far edge. Returns the top sheet's height."""
    w, h = surface_size('join')
    binding = 0.016
    mesh = Mesh('Pad')
    block = 0.007
    # The block of sheets, its writing area the panel's size, plus the strip under the binding.
    hw, hh = w / 2, (h + binding) / 2
    cy = binding / 2  # The writing area is centred on the origin; the binding runs past its far (+Y) edge.
    corners = [(-hw, cy - hh), (hw, cy - hh), (hw, cy + hh), (-hw, cy + hh)]
    top = [Vector((x, y, block)) for x, y in corners]
    bottom = [Vector((x, y, 0.0)) for x, y in corners]
    mesh.face([top[0], top[1], Vector((hw, h / 2, block)), Vector((-hw, h / 2, block))], 'paper', [(0, 1), (1, 1), (1, 0), (0, 0)])
    for j in range(4):
        k = (j + 1) % 4
        mesh.face([bottom[j], bottom[k], top[k], top[j]], 'paper_edge', [(0, 0)] * 4)
    # The binding: a cloth strip wrapped over the far edge, a little proud of the block.
    y0, y1 = h / 2 - 0.0005, cy + hh + 0.0012
    lift = 0.0009
    profile = [(y0, block), (y0 + 0.0015, block + lift), (y1 - 0.0025, block + lift), (y1, block - 0.002), (y1, 0.0015), (y1 - 0.002, 0.0)]
    rings = [[Vector((x, y, z)) for y, z in profile] for x in (-hw - 0.0008, hw + 0.0008)]
    mesh.loft(rings, 'brass_fabric', closed=False)
    for x, ring in ((-hw - 0.0008, rings[0]), (hw + 0.0008, rings[1])):
        mesh.face(ring + [Vector((x, y0, 0.0))], 'brass_fabric', away=(math.copysign(1, x), 0, 0))
    mesh.finish(matrix=matrix, parent=root, sharp=30)
    return block



# ------------------------------------------------------------------ the room, from the owner's desk

# The desk stands against a pier between two windows (evidence/refs/external/owner-desk-*.jpg): stained fir casings
# with a crown over each window, woven reed shades inside, a canvas over the computer. Proportions from IMG_2341,
# scaled by its 27-inch monitor (0.61 m across 515 px): the pier is about twice the monitor, a casing a sixth of it.
PIER = dict(x0=-0.56, x1=0.66)
CASING = dict(width=0.095, proud=0.022, bottom=-0.9, head=1.70, crown=0.15)
WINDOW = dict(width=0.86, depth=0.13, shade=0.03)
# Its bottom edge is just behind the computer's top from where the room is seen, as the owner's painting is behind their monitor.
CANVAS = dict(cx=0.05, bottom=0.24, w=0.68, h=0.49, depth=0.038)
# A spiral notebook in the near foreground, as the owner's lies at the front of the desk.
NOTEBOOK_AT = (-0.64, -0.40, 16.0)
NOTEBOOK = dict(w=0.152, h=0.215, t=0.011)
# One tile of wood.jpg: across the grain and along it, in metres. weave.jpg is square.
WOOD_TILE = (0.12, 0.6)
WEAVE_TILE = 0.3


def box(mesh, x0, x1, y0, y1, z0, z1, mat, grain='z', faces='all'):
    """An axis-aligned block with planar UVs: wood's grain runs along `grain`. `faces` leaves out the back (+Y) side when 'front'."""
    xs, ys, zs = (x0, x1), (y0, y1), (z0, z1)
    tile_u, tile_v = WOOD_TILE

    def uv(p, normal):
        axes = [a for a in 'xyz' if a != normal]
        along = grain if grain in axes else axes[-1]
        across = next(a for a in axes if a != along)
        co = dict(x=p[0], y=p[1], z=p[2])
        return (co[across] / tile_u, co[along] / tile_v)

    sides = [
        ('x', 0, [(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)),
        ('x', 1, [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
        ('y', 0, [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
        ('y', 1, [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
        ('z', 0, [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)),
        ('z', 1, [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
    ]
    for normal, end, points, away in sides:
        if faces == 'front' and normal == 'y' and end == 1:
            continue
        mesh.face([Vector(p) for p in points], mat, [uv(p, normal) for p in points], away=away)


def build_room(root):
    """The wall with its two window openings, the casings, the shades, and the canvas. Returns the room's record for the page."""
    wall_y = WALL_Y
    cw, proud = CASING['width'], CASING['proud']
    bottom, head, crown = CASING['bottom'], CASING['head'], CASING['crown']
    top = 2.6
    # Each window: its opening between an inner casing (against the pier) and an outer one.
    left = (PIER['x0'] - cw - WINDOW['width'], PIER['x0'] - cw)
    right = (PIER['x1'] + cw, PIER['x1'] + cw + WINDOW['width'])
    far = 3.2

    wall = Mesh('Wall')
    flat = lambda x0, x1, z0, z1: wall.face(
        [Vector((x0, wall_y, z0)), Vector((x1, wall_y, z0)), Vector((x1, wall_y, z1)), Vector((x0, wall_y, z1))],
        'wall', [(x0, z0), (x1, z0), (x1, z1), (x0, z1)], away=(0, -1, 0))
    flat(left[1], right[0], bottom, top)          # the pier, behind its casings too
    flat(-far, left[0], bottom, top)              # beyond the left window
    flat(right[1], far, bottom, top)              # beyond the right window
    flat(left[0], left[1], head, top)             # over each window
    flat(right[0], right[1], head, top)
    wall.finish(parent=root, sharp=10)

    wood = Mesh('Casings')
    shades = Mesh('Shades')
    windows = []
    for x0, x1 in (left, right):
        # The two side casings, the head casing over them, and its crown.
        box(wood, x0 - cw, x0, wall_y - proud, wall_y, bottom, head, 'wood', faces='front')
        box(wood, x1, x1 + cw, wall_y - proud, wall_y, bottom, head, 'wood', faces='front')
        box(wood, x0 - cw - 0.012, x1 + cw + 0.012, wall_y - proud - 0.004, wall_y, head, head + crown, 'wood', grain='x', faces='front')
        box(wood, x0 - cw - 0.03, x1 + cw + 0.03, wall_y - proud - 0.03, wall_y, head + crown, head + crown + 0.022, 'wood', grain='x', faces='front')
        box(wood, x0 - cw - 0.045, x1 + cw + 0.045, wall_y - proud - 0.045, wall_y, head + crown + 0.022, head + crown + 0.05, 'wood', grain='x', faces='front')
        # The reveal: the opening's sides and head, stained like the casings, back to the window.
        depth = WINDOW['depth']
        for x, away in ((x0, (1, 0, 0)), (x1, (-1, 0, 0))):
            wood.face([Vector((x, wall_y, bottom)), Vector((x, wall_y + depth, bottom)), Vector((x, wall_y + depth, head)), Vector((x, wall_y, head))],
                      'wood', [(0, bottom / WOOD_TILE[1]), (depth / WOOD_TILE[0], bottom / WOOD_TILE[1]), (depth / WOOD_TILE[0], head / WOOD_TILE[1]), (0, head / WOOD_TILE[1])], away=away)
        wood.face([Vector((x0, wall_y, head)), Vector((x1, wall_y, head)), Vector((x1, wall_y + depth, head)), Vector((x0, wall_y + depth, head))],
                  'wood', [(x0 / WOOD_TILE[1], 0), (x1 / WOOD_TILE[1], 0), (x1 / WOOD_TILE[1], depth / WOOD_TILE[0]), (x0 / WOOD_TILE[1], depth / WOOD_TILE[0])], away=(0, 0, -1))
        # The shade, let all the way down: reed across, a shallow pleat every 18 cm where its cords gather it.
        sy = wall_y + WINDOW['shade']
        rows = 48
        zs = [bottom + (head - 0.01 - bottom) * i / rows for i in range(rows + 1)]
        ring = lambda z: [Vector((x0 + 0.004 + (x1 - x0 - 0.008) * j / 6, sy + 0.006 * math.sin(2 * math.pi * (z - bottom) / 0.18) ** 2, z)) for j in range(7)]
        made = shades.loft([ring(z) for z in zs], 'weave', closed=False, uv=lambda co: (co.x / WEAVE_TILE, co.z / WEAVE_TILE))
        windows.append(dict(
            center=world(Vector(((x0 + x1) / 2, sy, (bottom + head) / 2))),
            width=round(x1 - x0, 5),
            height=round(head - bottom, 5),
            shade=world(Vector(((x0 + x1) / 2, sy, 0.0))),
        ))
    wood.finish(parent=root, sharp=30)
    shades.finish(parent=root, sharp=60)

    # The canvas: a gallery wrap on the pier, its face the whole image and its sides the image's outer edge.
    canvas = Mesh('Canvas')
    cx, cb, w, h, d = CANVAS['cx'], CANVAS['bottom'], CANVAS['w'], CANVAS['h'], CANVAS['depth']
    x0, x1, z0, z1, y0, y1 = cx - w / 2, cx + w / 2, cb, cb + h, wall_y - d, wall_y - 0.002
    canvas.face([Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y0, z1)), Vector((x0, y0, z1))], 'canvas_art', [(0, 1), (1, 1), (1, 0), (0, 0)], away=(0, -1, 0))
    wrap = d / w
    canvas.face([Vector((x0, y0, z0)), Vector((x0, y1, z0)), Vector((x0, y1, z1)), Vector((x0, y0, z1))], 'canvas_art', [(0, 1), (wrap, 1), (wrap, 0), (0, 0)], away=(-1, 0, 0))
    canvas.face([Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x1, y1, z1)), Vector((x1, y0, z1))], 'canvas_art', [(1, 1), (1 - wrap, 1), (1 - wrap, 0), (1, 0)], away=(1, 0, 0))
    canvas.face([Vector((x0, y0, z1)), Vector((x1, y0, z1)), Vector((x1, y1, z1)), Vector((x0, y1, z1))], 'canvas_art', [(0, 0), (1, 0), (1, wrap), (0, wrap)], away=(0, 0, 1))
    canvas.face([Vector((x0, y0, z0)), Vector((x1, y0, z0)), Vector((x1, y1, z0)), Vector((x0, y1, z0))], 'canvas_art', [(0, 1), (1, 1), (1, 1 - wrap), (0, 1 - wrap)], away=(0, 0, -1))
    canvas.finish(parent=root, sharp=30)

    return dict(
        pier=dict(x0=PIER['x0'], x1=PIER['x1']),
        casing=dict(width=cw, proud=proud),
        windows=windows,
        canvas=dict(center=world(Vector((cx, y0, cb + h / 2))), width=w, height=h),
    )


def build_notebook(root, matrix):
    """A spiral notebook, its top page written on, coils along the head."""
    w, h, t = NOTEBOOK['w'], NOTEBOOK['h'], NOTEBOOK['t']
    mesh = Mesh('Notebook')
    hw, hh = w / 2, h / 2
    rounded_slab(mesh, hw, hh, 0.004, 0.0, 0.0015, 'cover_black')
    corners = [(-hw + 0.002, -hh + 0.002), (hw - 0.002, -hh + 0.002), (hw - 0.002, hh - 0.012), (-hw + 0.002, hh - 0.012)]
    top = [Vector((x, y, t)) for x, y in corners]
    under = [Vector((x, y, 0.0015)) for x, y in corners]
    mesh.face(top, 'notebook_page', [(0, 1), (1, 1), (1, 0.06), (0, 0.06)])
    for j in range(4):
        k = (j + 1) % 4
        mesh.face([under[j], under[k], top[k], top[j]], 'paper_edge', [(0, 0)] * 4)
    # The coils: one small loop through the head of the pages every 8 mm.
    r = t * 0.62
    for i in range(int((w - 0.016) / 0.008) + 1):
        x = -hw + 0.008 + i * 0.008
        centre = Vector((x, hh - 0.010, t * 0.55))
        path = [centre + Vector((0, r * math.cos(a), r * math.sin(a))) for a in (2 * math.pi * k / 14 for k in range(15))]
        mesh.tube(path, 0.0007, 'coil', count=6)
    return mesh.finish(matrix=matrix, parent=root, sharp=40)


# ------------------------------------------------------------------ the arrangement

DESK = dict(x0=-0.86, x1=0.86, y0=-0.50, y1=0.58, thick=0.045)
WALL_Y = 0.58

MAC_AT = (-0.085, 0.085, 11.0)
KEYBOARD_AT = (-0.050, -0.205, 7.5)
MOUSE_AT = (0.283, -0.225, -11.0)
STACK_AT = (0.330, 0.052, 97.0)
# Possibilities' working card is beside the books; Join's pad is on the far side of the keyboard.
WORKING_AT = (0.590, -0.215, -5.0)
PEN_AT = (0.795, -0.250, 9.0)
PAD_AT = (-0.478, -0.178, 4.5)
LAMP_BASE = (0.585, 0.255)
LAMP_HEAD = (0.395, 0.205, 0.415)
LAMP_AIM = (0.215, -0.105, 0.0)


def world(v):
    """Blender to glTF: x, z, -y."""
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]


def surface_record(key, matrix, top):
    """Where a panel lies, in glTF space: the centre of its face, its facing, which way is up the page, and its size."""
    w, h = surface_size(key)
    rot = matrix.to_3x3()
    return dict(
        center=world(matrix @ Vector((0, 0, top + 0.0002))),
        normal=world((rot @ Vector((0, 0, 1))).normalized()),
        up=world((rot @ Vector((0, 1, 0))).normalized()),
        width=round(w, 5),
        height=round(h, 5),
        css=list(SURFACES[key]['css']),
    )


def build():
    # A fresh empty file that keeps the preferences, so a live Blender keeps its add-ons.
    bpy.ops.wm.read_homefile(use_empty=True, use_factory_startup=True)
    random.seed(1984)
    root = bpy.data.objects.new('Study', None)
    bpy.context.scene.collection.objects.link(root)

    mac_group = bpy.data.objects.new('Computer', None)
    bpy.context.scene.collection.objects.link(mac_group)
    mac_group.parent = root
    mac_matrix = at(MAC_AT[0], MAC_AT[1], 0, MAC_AT[2])
    mac_group.matrix_world = mac_matrix
    _, screen_centre, screen_normal = build_computer(mac_group)

    keyboard = build_keyboard(root, at(KEYBOARD_AT[0], KEYBOARD_AT[1], 0, KEYBOARD_AT[2]))
    mouse = build_mouse(root, at(MOUSE_AT[0], MOUSE_AT[1], 0, MOUSE_AT[2]))
    bpy.context.view_layer.update()
    build_cables(root, keyboard, mouse, mac_matrix)

    # Stacked with their spines to the camera, so all three titles read from the opening view.
    records = {}
    stack = [('dream', 0.0, 0.0, 0.0), ('hamming', 0.0045, -0.003, -2.6), ('everyone', 0.0015, 0.004, 2.0)]
    z = 0.0
    place = {}
    for key, dx, dy, turn in stack:
        book = BOOKS[key]
        # Local x runs spine to fore edge and y tail to head; centred on the stack's axis.
        local = Matrix.Translation((dx, dy, z)) @ Matrix.Rotation(math.radians(turn), 4, 'Z') @ Matrix.Translation((-book['w'] / 2, -book['h'] / 2, 0))
        matrix = at(STACK_AT[0], STACK_AT[1], 0, STACK_AT[2]) @ local
        _, record = build_book(root, key, matrix)
        records[key] = record
        place[key] = matrix
        z += book['t']
    build_ribbon(root, place['hamming'], BOOKS['dream']['t'])

    _, light, target = build_lamp(root, LAMP_BASE, LAMP_HEAD, LAMP_AIM)

    working_matrix = at(WORKING_AT[0], WORKING_AT[1], 0, WORKING_AT[2])
    working_top = build_working(root, working_matrix)
    build_pen(root, at(PEN_AT[0], PEN_AT[1], 0, PEN_AT[2]))
    pad_matrix = at(PAD_AT[0], PAD_AT[1], 0, PAD_AT[2])
    pad_top = build_pad(root, pad_matrix)
    room = build_room(root)
    build_notebook(root, at(NOTEBOOK_AT[0], NOTEBOOK_AT[1], 0, NOTEBOOK_AT[2]))

    bpy.context.view_layer.update()
    # The screen's centre and facing, in world space.
    centre_world = mac_matrix @ screen_centre
    normal_world = (mac_matrix.to_3x3() @ screen_normal).normalized()
    stack_top = at(STACK_AT[0], STACK_AT[1], 0, STACK_AT[2]) @ Vector((0, 0, z))
    layout = dict(
        screen=dict(
            center=world(centre_world),
            normal=world(normal_world),
            up=world((mac_matrix.to_3x3() @ Vector((0, LEAN, 1)).normalized()).normalized()),
            halfWidth=RASTER['hw'],
            halfHeight=RASTER['hh'],
            # The glass bows toward the viewer by this much at the centre.
            bulge=BULGE,
            # The raster's corners, and how far its edge lies behind its centre.
            radius=RASTER['r'],
            edgeDepth=round(raster_edge_depth(), 5),
        ),
        lamp=dict(position=world(light), target=world(target)),
        books=dict(top=world(stack_top), center=world(Vector((STACK_AT[0], STACK_AT[1], z / 2)))),
        possibilities=surface_record('possibilities', working_matrix, working_top),
        join=surface_record('join', pad_matrix, pad_top),
        desk=dict(x0=DESK['x0'], x1=DESK['x1'], front=-DESK['y0'], back=-DESK['y1'], thick=DESK['thick']),
        wall=dict(z=-WALL_Y),
        room=room,
        covers=records,
    )
    os.makedirs(os.path.dirname(LAYOUT), exist_ok=True)
    with open(LAYOUT, 'w') as f:
        json.dump(layout, f, indent=2)
        f.write('\n')
    photo_skin()
    return layout


# ------------------------------------------------------------------ the photograph on the model

PHOTO = os.path.join(SITE, 'evidence/refs/external/classic-ii-owner-photo.webp')
# Where the computer, keyboard and mouse stood when the photograph was taken, in the model's own terms.
PHOTO_PLACES = {
    'Computer': at(0, 0, 0, 0),
    'Keyboard': at(0.008, -0.245, 0, 0),
    'Mouse': at(0.021, -0.410, 0, 76),
}
# What wears the photograph, and the least a face must turn to the lens to take it: a face seen more edge-on
# than that keeps the modeled plastic instead of a smear. The mouse stays modeled: it lies in the photograph at
# an angle the model cannot match closely enough, and its parting line lands across the shell.
PHOTO_SKIN = {'Mac': 0.22, 'Keyboard': 0.1}
# The sharp-edge angle each was finished with, kept when its faces are cut finer for the photograph.
PHOTO_SHARP = {'Mac': 38, 'Keyboard': 46}
# The faces the lens sees are cut to triangles no longer than this.
PHOTO_GRAIN = {'Mac': 0.022, 'Keyboard': 0.035}
# Where a face's samples fall on desk or wall in the photograph, the model runs past the photographed outline:
# such a face keeps the modeled plastic. The desk and wall are brighter than the plastic everywhere in this
# photograph, so a luminance ceiling finds them (sRGB, 0 to 1).
PHOTO_BACKGROUND = {'Mac': 0.79, 'Keyboard': 0.84}
# The photograph saw the keys' fronts square on and their tops edge-on, with the gaps' shadow on the fronts.
# From above, that shadow reads as a dark grid: the caps take the photograph on their tops only (the least
# upward the face's normal points), and not where a top lands on the shadow of a gap (the least luminance).
PHOTO_TOPS_ONLY = {'ivory_key': (0.55, 0.5)}
# The foot: in the photograph the keyboard's back edge stands in front of it, and it is plain dark plastic anyway.
PHOTO_KEEP_MODELED = {'foot'}
# Below this height the photograph shows the mouse's cord lying along the keyboard's front: those faces keep
# the modeled plastic, so the edge between the two runs level.
PHOTO_ABOVE = {'Mac': 0.0, 'Keyboard': 0.008}


def photo_camera():
    """The lens the photograph was taken with, as matched for the collage: 85 mm, square on, from desk height."""
    scene = bpy.context.scene
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 848
    found = bpy.data.objects.get('photo_camera')
    if found:
        return found
    camera = bpy.data.cameras.new('photo_camera')
    camera.lens = 85
    camera.sensor_width = 36
    camera.shift_y = -0.332
    cam = bpy.data.objects.new('photo_camera', camera)
    cam.location = (0.0, -1.42, 0.30)
    cam.rotation_euler = (math.radians(90), 0, 0)
    scene.collection.objects.link(cam)
    return cam


def photo_skin():
    """
    Lay the photograph on the computer, keyboard and mouse: stand them where they stood, project every face
    the camera saw through the photograph's lens, and give those faces the photograph as their colour. Faces
    the camera did not see, or saw edge-on, keep the modeled plastic. The objects go back where the room has them.
    """
    from bpy_extras.object_utils import world_to_camera_view
    from mathutils.bvhtree import BVHTree

    scene = bpy.context.scene
    cam = photo_camera()
    objects = {name: bpy.data.objects[name] for name in PHOTO_SKIN}
    saved = {name: bpy.data.objects[name].matrix_world.copy() for name in PHOTO_PLACES}
    for name, matrix in PHOTO_PLACES.items():
        bpy.data.objects[name].matrix_world = matrix
    bpy.context.view_layer.update()

    image = bpy.data.images.load(PHOTO, check_existing=True)
    image.name = 'classic-ii-photo'
    import numpy

    width, height = image.size
    rgba = numpy.array(image.pixels[:], dtype=numpy.float32).reshape(height, width, 4)
    # Rows run bottom to top, as the camera view's y does.
    luminance = rgba[..., 0] * 0.2126 + rgba[..., 1] * 0.7152 + rgba[..., 2] * 0.0722
    skin = bpy.data.materials.new('photo')
    skin.use_nodes = True
    nodes = skin.node_tree.nodes
    bsdf = nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.46
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.extension = 'EXTEND'
    uv = nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'photo'
    skin.node_tree.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    skin.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])

    # Triangles, so every sample point lies on its own face; and the faces the lens sees are cut finer, so a
    # face half behind the mouse is decided piece by piece and the photograph's perspective holds across each.
    # Some lofts face inward (the glTF is double-sided), so a face counts by how squarely it meets the lens
    # whichever way it points; the ray cast settles whether it was the one in front.
    eye = cam.matrix_world.translation
    for name, obj in objects.items():
        world = obj.matrix_world
        normal_matrix = world.to_3x3().inverted().transposed()
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')

        def squarely(face):
            centre = world @ face.calc_center_median()
            return abs((normal_matrix @ face.normal).normalized().dot((eye - centre).normalized()))

        for _ in range(4):
            bm.normal_update()
            long_edges = {
                e
                for f in bm.faces
                if squarely(f) >= PHOTO_SKIN[name]
                for e in f.edges
                if e.calc_length() > PHOTO_GRAIN[name]
            }
            if not long_edges:
                break
            bmesh.ops.subdivide_edges(bm, edges=list(long_edges), cuts=1, use_grid_fill=False)
            bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3], quad_method='BEAUTY', ngon_method='BEAUTY')
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.set_sharp_from_angle(angle=math.radians(PHOTO_SHARP[name]))

    # One tree over everything the photograph shows, the mouse included, so a face hidden behind another
    # object counts as hidden.
    verts, polys, owner = [], [], []
    for name, obj in {**objects, 'Mouse': bpy.data.objects['Mouse']}.items():
        world = obj.matrix_world
        base = len(verts)
        verts.extend(world @ v.co for v in obj.data.vertices)
        for p in obj.data.polygons:
            polys.append([base + i for i in p.vertices])
            owner.append((name, p.index))
    tree = BVHTree.FromPolygons(verts, polys)

    def seen(name, index, point):
        direction = point - eye
        hit = tree.ray_cast(eye, direction.normalized(), direction.length + 0.01)
        if hit[0] is None:
            return False
        return owner[hit[2]] == (name, index) or (hit[0] - point).length < 0.0012

    counts = {}
    for name, obj in objects.items():
        mesh = obj.data
        world = obj.matrix_world
        normal_matrix = world.to_3x3().inverted().transposed()
        layer = mesh.uv_layers.new(name='photo')
        mesh.materials.append(skin)
        slot = len(mesh.materials) - 1

        projected = [world_to_camera_view(scene, cam, world @ v.co) for v in mesh.vertices]

        def brightness(point):
            p = world_to_camera_view(scene, cam, point)
            x = min(max(int(p.x * width), 0), width - 1)
            y = min(max(int(p.y * height), 0), height - 1)
            return luminance[y, x]

        def background(point):
            # Brighter than the plastic is desk or wall; bluer than it is the screen's picture, which a face at
            # the lip of the recess can catch where the model and the photograph part by a pixel.
            p = world_to_camera_view(scene, cam, point)
            x = min(max(int(p.x * width), 0), width - 1)
            y = min(max(int(p.y * height), 0), height - 1)
            r, _, b, _ = rgba[y, x]
            return luminance[y, x] > PHOTO_BACKGROUND[name] or b > r + 0.02

        taken = 0
        for poly in mesh.polygons:
            centre = world @ poly.center
            normal = (normal_matrix @ poly.normal).normalized()
            toward = (eye - centre).normalized()
            if abs(normal.dot(toward)) < PHOTO_SKIN[name]:
                continue
            modeled = mesh.materials[poly.material_index].name
            if modeled in PHOTO_KEEP_MODELED or centre.z < PHOTO_ABOVE[name]:
                continue
            tops = PHOTO_TOPS_ONLY.get(modeled)
            if tops is not None and abs(normal.z) < tops[0]:
                continue
            samples = [centre + toward * 0.0002]
            samples += [centre.lerp(world @ mesh.vertices[i].co, 0.8) + toward * 0.0002 for i in poly.vertices]
            if not all(seen(name, poly.index, s) for s in samples):
                continue
            if sum(background(s) for s in samples) * 2 >= len(samples):
                continue
            if tops is not None and min(brightness(s) for s in samples) < tops[1]:
                continue
            poly.material_index = slot
            for li, vi in zip(poly.loop_indices, poly.vertices):
                layer.data[li].uv = projected[vi].xy
            taken += 1
        counts[name] = (taken, len(mesh.polygons))

    for name, matrix in saved.items():
        bpy.data.objects[name].matrix_world = matrix
    bpy.context.view_layer.update()
    print('photo skin', counts)


def export():
    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=GLB,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_normals=True,
        export_texcoords=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        # The photograph rides in the file as a JPEG; nothing else in the room carries an image.
        export_image_format='JPEG',
        export_jpeg_quality=90,
    )


def preview_mac(fit=False):
    """
    A front elevation of the computer alone, through the photograph's lens, for the collage. With fit, the
    photographed faces show the photograph unlit and every other face shows magenta, so where the model and
    the photograph part reads straight off the diff.
    """
    scene = bpy.context.scene
    keep = {'Mac', 'Tube', 'Screen', 'Keyboard', 'Mouse', 'Study', 'Computer', 'photo_camera'}
    for obj in list(bpy.data.objects):
        if obj.name not in keep:
            obj.hide_render = True
    for name, matrix in PHOTO_PLACES.items():
        bpy.data.objects[name].matrix_world = matrix
    bpy.context.view_layer.update()
    if fit:
        for mat in bpy.data.materials:
            if not mat.use_nodes:
                continue
            nodes = mat.node_tree.nodes
            out = nodes.get('Material Output')
            emit = nodes.new('ShaderNodeEmission')
            if mat.name == 'photo':
                mat.node_tree.links.new(nodes['Image Texture'].outputs['Color'], emit.inputs['Color'])
            else:
                emit.inputs['Color'].default_value = (1, 0, 1, 1)
            mat.node_tree.links.new(emit.outputs['Emission'], out.inputs['Surface'])

    floor = bpy.data.meshes.new('floor')
    floor.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 2, 0), (-3, 2, 0)], [], [(0, 1, 2, 3)])
    fm = bpy.data.materials.new('floor')
    fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.82, 0.82, 0.82, 1)
    floor.materials.append(fm)
    scene.collection.objects.link(bpy.data.objects.new('floor', floor))

    world_data = bpy.data.worlds.new('w')
    world_data.use_nodes = True
    world_data.node_tree.nodes['Background'].inputs[0].default_value = (0.86, 0.85, 0.83, 1)
    world_data.node_tree.nodes['Background'].inputs[1].default_value = 0.58
    scene.world = world_data

    sun = bpy.data.lights.new('key', 'AREA')
    sun.size = 1.2
    sun.energy = 13
    key = bpy.data.objects.new('key', sun)
    key.matrix_world = Matrix.Translation((0.5, -1.0, 1.1)) @ Matrix.Rotation(math.radians(50), 4, 'X')
    scene.collection.objects.link(key)

    scene.camera = photo_camera()

    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 48
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 848
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    os.makedirs(RENDERS, exist_ok=True)
    if fit:
        scene.cycles.samples = 8
        scene.cycles.use_denoising = False
        bpy.data.objects['floor'].hide_render = True
        world_data.node_tree.nodes['Background'].inputs[1].default_value = 0.0
    scene.render.filepath = os.path.join(RENDERS, 'blender-photo-fit.png' if fit else 'blender-mac-front.png')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview', choices=['mac', 'fit'], default=None)
    # Blender passes its own flags; a script's own come after a bare --.
    args, _ = parser.parse_known_args(sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else sys.argv[1:])
    layout = build()
    export()
    print('wrote', GLB, os.path.getsize(GLB), 'bytes')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    print('triangles', sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes), [o.name for o in meshes])
    if args.preview:
        preview_mac(fit=args.preview == 'fit')
