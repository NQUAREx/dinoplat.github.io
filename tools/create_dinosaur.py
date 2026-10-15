"""Create our texture-free low-poly T-rex with Blender's bundled Python.

Run: blender --background --factory-startup --python tools/create_dinosaur.py
Coordinates: Blender +Y = forward, +Z = up; exported glTF faces -Z, Y up.
The .blend is editable; the runtime GLB has one mesh, one primitive, no rig/textures.
"""
from pathlib import Path
import json
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "assets" / "dinosaur.glb"
SOURCE = ROOT / "art" / "dinosaur.blend"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
SOURCE.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
white = bpy.data.materials.new("Chalk")
white.diffuse_color = (0.93, 0.96, 0.94, 1)
dark = bpy.data.materials.new("Eyes")
dark.diffuse_color = (0.018, 0.03, 0.038, 1)
parts = []


def finish(name, scale, material=white):
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    parts.append(obj)
    return obj


def ico(name, position, scale, material=white):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=position)
    return finish(name, scale, material)


def box(name, position, scale, tilt=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=position)
    obj = finish(name, scale)
    obj.rotation_euler.x = tilt
    return obj


def tapered(name, start, end, radius1, radius2, vertices=6):
    a, b = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1,
                                  radius2=radius2, depth=(b-a).length,
                                  location=(a+b)/2)
    obj = finish(name, (1, 1, 1))
    obj.rotation_euler = (b-a).to_track_quat("Z", "Y").to_euler()
    return obj


ico("Body", (0, -0.04, 0.68), (0.23, 0.31, 0.31))
ico("Chest", (0, 0.12, 0.86), (0.19, 0.23, 0.26))
box("Neck", (0, 0.19, 0.99), (0.24, 0.24, 0.32), -0.28)
box("Head", (0, 0.30, 1.16), (0.38, 0.35, 0.30), -0.08)
box("Muzzle", (0, 0.51, 1.13), (0.34, 0.23, 0.19))
box("Jaw", (0, 0.46, 1.025), (0.29, 0.28, 0.045))

# Tapered tail stays inside the model's compact depth envelope.
tapered("Tail base", (0, -0.20, 0.70), (0, -0.54, 0.57), 0.145, 0.075)
tapered("Tail tip", (0, -0.54, 0.57), (0, -0.82, 0.62), 0.075, 0.008)

# Deliberately asymmetric stride; animated cheaply as a rigid mesh in-game.
for side in (-1, 1):
    x = side * 0.145
    stride = side * 0.065
    ico("Haunch", (x, -0.09, 0.48), (0.12, 0.18, 0.22))
    box("Shin", (x, -0.04 + stride, 0.20), (0.105, 0.12, 0.29), side * 0.18)
    box("Foot", (x, 0.035 + stride, 0.055), (0.135, 0.27, 0.11))
    tapered("Tiny arm", (side*0.17, 0.20, 0.80), (side*0.23, 0.33, 0.71), 0.046, 0.027, 5)
    ico("Eye", (side*0.194, 0.36, 1.205), (0.017, 0.048, 0.045), dark)

# Bake all pieces into one static mesh. Colour replaces material groups so eyes
# do not cost another draw call; glTF contains no images, UVs or textures.
bpy.ops.object.select_all(action="DESELECT")
for obj in parts:
    obj.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
dino = bpy.context.object
dino.name = "Dinosaur"
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
colour = dino.data.color_attributes.new(name="Colour", type="BYTE_COLOR", domain="CORNER")
for polygon in dino.data.polygons:
    rgba = dino.data.materials[polygon.material_index].diffuse_color
    polygon.use_smooth = False
    for index in polygon.loop_indices:
        colour.data[index].color = rgba
    polygon.material_index = 0
dino.data.color_attributes.active_color = colour
dino.data.materials.clear()
material = bpy.data.materials.new("Dinosaur vertex colour")
material.use_nodes = True
nodes = material.node_tree.nodes
shader = nodes.get("Principled BSDF")
shader.inputs["Roughness"].default_value = 1
shader.inputs["Metallic"].default_value = 0
vertex = nodes.new("ShaderNodeVertexColor")
vertex.layer_name = "Colour"
material.node_tree.links.new(vertex.outputs["Color"], shader.inputs["Base Color"])
dino.data.materials.append(material)
for uv in list(dino.data.uv_layers):
    dino.data.uv_layers.remove(uv)
dino.data.calc_loop_triangles()

bpy.context.scene.world.color = (0.12, 0.15, 0.18)
# Store a useful initial editing view in the source file.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_distance = 3
            area.spaces.active.region_3d.view_location = (0, 0, 0.65)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB",
                          use_selection=True, export_yup=True,
                          export_texcoords=False, export_normals=True,
                          export_materials="EXPORT", export_animations=False,
                          export_cameras=False, export_lights=False,
                          export_extras=False)
print("DINO_EXPORT", json.dumps({"triangles": len(dino.data.loop_triangles),
      "bytes": OUTPUT.stat().st_size, "glb": str(OUTPUT), "blend": str(SOURCE)}))
