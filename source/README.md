# LMP — Leo's Material Painter

A personal and free alternative to paid material painting programs like Substance Painter, for Windows.

**Owned by H9_zy.**

## Version

The version is shown next to **LMP** in the menu bar. A small update adds 0.01 (v0.01 → v0.02). A big update goes to the next whole number (v1.00, v2.00 …).

## Open it

Double-click **LMP.exe**. It runs in its own window on your fast graphics card, and nothing needs installing. On laptops with two GPUs it picks the dedicated one, which browsers often don't.

- The **presets** folder next to LMP.exe loads automatically, so there's no "Link folder" step.
- Saved materials, brushes and graphs go into that folder too.
- **Projects are .lmp files.**
  - **File → Save** (Ctrl+S) suggests the model's name, e.g. `Test vase.lmp`. After the first save, Ctrl+S just overwrites that file.
  - **Save as…** (Ctrl+Shift+S) asks where to save a copy, and **Open project…** (Ctrl+O) opens one. Old `.tpaint` projects open too.
  - **Import…** (Ctrl+I) brings in models, HDRIs, Substance files, presets and textures.
  - In File Explorer, `.lmp` files show the LMP icon. Double-click one to open it in LMP; if LMP is already open, the file opens in that window.
- **F11** switches to full screen. **F12** opens developer tools, which help when reporting a problem.


Performance:

- The viewport only redraws while something is happening, so an idle LMP barely uses the GPU.
- Shelf thumbnails are made only when they scroll into view.
- Smart masks keep their generator result cached, so painting on a mask doesn't recompute the noise stack every frame.

## New in v2.00

- **Scanned materials.** 114 CC0 photo scans from ambientCG (metal, rust, painted metal, sci-fi plates, wood, stone, bricks, ground, fabric, leather, plastic, plaster) with colour, roughness, metal, normal and height maps. They're on the shelf with previews and download the first time you use one (about 4 MB each), then stay on your PC in `presets/Scanned materials`.
- **Realistic smart materials** built from the scans the way Substance builds them (a scanned base, then scanned rust or paint, dirt, grunge and edge wear placed by smart masks): Rusty Metal, Heavy Rust, Chipped Red Paint, Worn Green Paint, Industrial White Paint, Sci-Fi Panels, Scratched Gunmetal, Tarnished Gold, Worn Chrome, Worn Diamond Plate, Old Wood Planks, Mossy Rock, Dirty Concrete, Worn Leather and Dusty Rubber.
- **Studio photo lighting** by default (an HDR from Poly Haven), so metals reflect properly. Pick another in Display settings.
- **Bringing Substance materials in.** Substance materials only run in Adobe's engine; the Guide shows how to export one from Substance Painter and use it in LMP with the exact same look.

## New in v1.04

- **Walk me through it.** Guides like Shapes, Masks, Painting, Baking, Smart materials and Export can show you how: a purple pointer moves to each button with a short note under it, and the next step starts when you do it.

## New in v1.03

- Updates download one small file (the update zip) and the GitHub release only lists the two downloads.

## New in v1.02

- **Updates.** LMP checks GitHub when it starts. If a new version is out it tells you, and **Update now** downloads only the changed files and restarts LMP. Pick **Later** and an orange **Update** button stays in the top bar until you update. **File → Check for updates** checks any time.
- **Shape generator.** Right-click a layer → **Add generator → Shape**. Pick a circle, square, star, heart and more, then drag it on the model to move it. Size, stretch, rotation and edge hardness are in Properties.

## New in v1.01

- The Gubby brush is now one brush in the normal Brushes list (no separate section).

## New in v1.00

- **Autosave and crash recovery.** A backup is saved every few minutes while you work (D:\LMP\autosave if you have a D: drive). If LMP closes by accident, it offers to restore the backup next time.
- **Start window.** New file, recent projects, autosaves and Browse in one place. Ctrl+O opens it too.
- **History panel (H).** Your last 25 changes. Click one to go back to it; click the top row to come back.
- **Settings** (File → Settings): autosave, texture size for new files, render scale, undo steps, low performance mode, start screen.
- **Low performance mode.** On a weak device LMP asks before loading whether to use it.
- **Guide (F1).** The purple Guide button replaces Help. It has short how-tos with "Show me" buttons, and a search that understands normal questions and typos. The 3D + 2D layout key moved from F1 to F4.
- **Smoothing (lazy mouse)** for steady strokes, and **pen pressure** (size and flow) for drawing tablets.
- **Layer thumbnails** show what is really painted on each layer and mask.
- **Real smart material previews.** The previews are made by running the real layers on a test box with baked edges and cavities.
- **UV overlap check.** Press **O** (or the button next to the wireframe button). Places where UV pieces overlap show as dark spots in the 2D view and on the 3D model, so you can find the faces and fix them in Blender. LMP also warns you when you open a model that has them.
- **Gubby brush.** Stamps Gubby onto your model (Assets → Brushes → Gubby).
- **18 more brushes:** leaks, rust blotches, hair/fur, wood grain, torn tape, pencil, bubbles, skin pores, gravel, cloth weave, cross hatch, hexagons, dry cracks, sea sponge, dents, smudge, dust and chipped paint.

## New in v0.17

Ported from **TextureCraft**, which is open source under MIT/Apache:

- **Ray-traced bakers.** AO, curvature and thickness, with TextureCraft's environments and ACES tone mapping.
- **Smart masks with effect stacks.** A mask is a stack of generators and patterns, mixed with blend modes (Multiply cuts away, Lighten adds) at any opacity. There are 28 presets: *Edges Worn*, *Edges Chipped*, *Dirt in Cavities*, *Dust from Top*, *Rust Leaks*, *Scratches*, *Fingerprints*, *Moss from Top*, *Water Stains*, *Snow*, *Rain Streaks*, *Drips* and more.
  - Find them under **Assets → Smart masks**: click one, or drag it onto a layer.
  - They're also in the mask menu and the right-click menu.
  - With a mask selected, **Properties → Mask effects** adds, reorders, blends and removes effects.
- **23 procedural patterns,** generated in 3D on the model, so there are no seams: Clouds, Grunge, Scratches, Streaks, Chips, Cells, Voronoi, Wood, Bricks, Tiles, Weave, Twill, Leather, Hammered, Brushed, Marble, Pores, Smudges and more.
- **Material library.** 93 procedural materials and smart materials, under **Assets → Smart materials**. They cover metals (measured base colors), woods, stone, plastics, fabric and leather, plus worn, rusty, dirty and mossy versions: *Steel Painted Worn*, *Iron Rusted*, *Copper Oxidized*, *Military Paint*, *Brick Mossy*, *Concrete Dirty* and so on. Select one of their fill layers to change each channel's pattern, scale, seed and Low/High values in **Properties → Procedural channels**.
- **Brushes.** TextureCraft's alpha library (31 shapes plus stencil letters A–Z and 0–9) and 20 more brush presets: airbrush, dry brush, sponge, spray, splatter, chips, cracks, stars, stitches, rivets, bolts, screws, fur, leaves, vents and speckle.
- **Painting.**
  - **Flow** now builds up with every stamp, as it does in Substance.
  - The new **Opacity** slider caps how much one stroke can cover.
  - **Symmetry X / Y / Z** mirrors strokes across the model's centre. It's in the top bar, and **X** toggles it.

The **Material Designer** tab (top right) is inspired by Material Painter. The code is LMP's own, because Material Painter's licence is GPL.

- **Graph.** Build tileable materials from nodes: generators, adjust, blend, filters and outputs.
  - Drag from a node's output dot to another node's input to connect them.
  - Double-click empty space to search for a node.
  - Delete removes the selected nodes; Ctrl+D duplicates them.
  - **Add as fill layer** puts the graph on the model. With **Live** on, every change updates that layer straight away.
  - The graph is saved inside the project. **Save…** also writes a `.tpgraph` file.
  - Preset graphs: Rusty Metal, Brick Wall, Wood Planks and Metal Grid.
- **Shader Maker.** Write your own nodes in GLSL, with a header like `// @param scale: float(1, 64) = 6`.
  - The preview updates and errors show as you type.
  - Every built-in node can be opened and copied.
  - **Save & add to graph** adds your node to the library.

**Free CC0 assets** are in the `presets` folder. Link it from the Assets panel.

- **19 Poly Haven texture sets:** rusty metal, corrugated iron, bricks, planks, leather, denim and more.
- **10 Poly Haven HDRIs:** click one under **Assets → Environments** to light the scene with it.

## Layout

Same structure as Substance Painter:

- **Menu bar:** File, Edit, Mode, Viewport and Help menus, plus the **Painting / Baking** mode tabs on the right.
- **Tool strip (far left):** Paint, Erase, Polygon fill, Path, Material picker, and paint-the-mask.
- **Tool settings bar (top):** Size, Flow, Hardness and Spacing for the current tool. On the right are the 3D/2D layout buttons, the UV wireframe toggle and frame.
- **Assets (left):** built-in starter smart materials, materials and texture sets, plus your linked presets folder. Search them and filter by type. Click an asset to use it.
- **Viewports:** 3D on the left and the 2D (UV) view on the right. Each has its own channel dropdown at the top.
- **Texture set list, Layers, Properties (right).** Layer rows have blend mode and opacity on the right. The Layers toolbar adds paint layers, fill layers and masks (white, black or smart). Properties changes with the selection: Paint, Fill or Mask.
- **Right strip:** Export, Texture set settings, Display settings (lighting, tone map, exposure, FOV, shading) and Baking mode.

Click a group title in a panel to collapse it.

## Substance workflows

- **Undo everything.** Ctrl+Z steps back through paint strokes, layer moves, add/delete, renames, visibility, blend/opacity, fill-material and texture edits, masks and asset drops. Slider drags count as one step. A short message shows what was undone.
- **Multi-select.** Ctrl+click layers to select several (Shift+click for a range). Drag them together, change visibility/blend/opacity for all at once, or right-click → group, duplicate, delete. On the Assets shelf, Ctrl+click several materials and drag them onto the model together.

- **Drag materials onto the model.** Drag any asset from the shelf onto the 3D view. **Drop onto** (under the shelf filters) picks what it covers:
  - *Whole model*: a new fill layer, or a folder for smart materials.
  - *Object*: one separate mesh in your file.
  - *Mesh part*: one connected piece.
  - *UV island* or *Triangle*.

  Partial drops make a fill layer with a black mask that's filled only on that part. You can also drag onto a fill layer in the stack to swap its material, or onto Properties to load it into the brush.
- **Black mask → paint the material.** Right-click any layer or folder and choose **Add black mask**, or use **Add black mask & paint** in Properties. Then paint on the model: white reveals the layer, Erase hides it again. This works for fill layers and for whole folders, such as a smart material.
- **Folders.** Smart materials come in as a folder. The folder's mask, opacity and blend mode apply to everything inside it. Drag layers to reorder them; drop a layer on the middle of a folder to put it inside. The right-click menu also has *New folder above* and *Put in a new folder*.
- **Polygon fill (G).** Pick Triangle / UV island / Mesh part / Object in the top bar.
  - **Click** a part, in the 3D view or the 2D (UV) view, to fill it.
  - **Drag a box** from anywhere, including empty space. Everything inside it is highlighted **red** and gets filled when you let go. **Ctrl + drag** fills black, which removes those parts again.
  - On a fill layer or a folder, it works like Substance: a **black mask** is added automatically and the selected islands or parts are filled white. On a paint layer it fills with the brush material.
- **Path tool (L), with bezier curves like Substance's.**
  - Click on the model to add points. Click and drag while placing a point to pull out its bezier handles.
  - The brush follows the curve live (**Live** in the top bar). Drag a point or a handle and the stroke repaints as you move it.
  - **Ctrl+click** a point to reset its handles to smooth. **Delete** or **Backspace** removes the selected point.
  - **Enter** or double-click finishes the path as one undo step. **Esc** cancels it and removes the stroke.
  - It also works in the 2D view.
- **Picker (P).** Pick the **whole material** or **only its color** from the model or the 2D view. A swatch next to the cursor shows what you'll get. Press **P** again, or pick something, to go back to the tool you were using.
- **Straight lines.** With the brush, **Shift+click** draws a straight line from where the last stroke ended.

## Brushes

- **Assets → Brushes** has 30 presets: Basic hard and soft, Airbrush, Square, Splatter, Grunge, Scratches, Dry brush, Sponge, Spray, Chips, Cracks, Stars, Stitches, Rivets, Bolts, Screws, Fur, Leaves and more. Click one to use it.
- **Flow / Stroke opacity:** Flow is how much each stamp adds, so it builds up as you go over an area. Stroke opacity is the most one stroke can reach. **Ctrl + left-drag** changes flow (←→) and rotation (↑↓), like Substance.
- **Symmetry:** the X / Y / Z buttons in the top bar mirror strokes across the model. Press **X** to toggle X.
  - A **red line** shows where each mirror plane cuts the model.
  - Move a plane with **Properties → Brush → X / Y / Z position**, from −100% to 100% of the model's half size. **Centre the mirror planes** resets them.
- **Properties → Brush tip** sets the tip shape:
  - **Angle** and **Follow stroke direction**.
  - **Angle jitter**, **Size jitter** and **Scatter**.
- **Import tip…** turns any picture into a tip: white (or opaque) areas paint. You can also put PNGs in a `brushes` folder inside your presets folder, and they show up as brushes.
- **Save brush…** saves the current tip and settings as a `.tpbrush` preset.

## Importing images (like Substance)

**Drag PNG / JPG images onto LMP**, or use **File → Import…**. A dialog asks what each image is: Base color, Roughness, Metallic, Height, Normal (OpenGL or DirectX), Emissive, a **mask** for the selected layer, a **brush tip**, or Assets shelf only. Names like `_BaseColor`, `_Normal`, `_Roughness` and `_Height` are picked automatically. Choose **New fill layer** or **Selected fill layer**, then **Import**.

On any fill layer, every channel row in Properties has an image button: click it, or drop an image on the row, to use a picture for that channel. **⟳** replaces the image and **×** removes it.

## Image materials (fill layer settings)

Select a fill layer that uses a texture set (for example one converted from Substance). Properties then has:

- **Projection**: *UV*, or *Tri-planar* (projects from 3 sides in 3D, so there are no visible UV seams).
- **Placement**: Scale, Rotation and Offset, plus blend sharpness for tri-planar.
- **Adjustments** for each channel:
  - Base color: hue, saturation, brightness, contrast, tint.
  - Roughness: min/max, and invert (gloss → rough).
  - Metallic: min/max.
  - Height: intensity and offset.
  - Normal: strength.
  - Emissive: intensity.
- **Reset** puts placement and adjustments back to their defaults.

## Controls

| Action | Input |
|---|---|
| Paint / Erase / Polygon fill / Path / Material picker | `B` / `E` / `G` / `L` / `P` |
| Straight line from the last stroke | Shift + click |
| Path: paint / remove last point / clear | Enter or double-click / Backspace / Esc |
| Orbit | Right mouse, or Alt + left mouse |
| Pan | Middle mouse |
| Zoom | Mouse wheel |
| Brush size / hardness | `[ ]` / `{ }` |
| Brush size (←→) and hardness (↑↓) | Hold **Ctrl** + right-drag (same as Substance) |
| Brush flow (←→) and rotation (↑↓) | Hold **Ctrl** + left-drag (same as Substance) |
| Layout: 3D + 2D / 3D only / 2D only | `F1` / `F2` / `F3` |
| Views (both panes) | `1`–`9`, `0` |
| Paint the selected layer's mask | `M`, or click the mask thumbnail |
| Frame model (or 2D view under the mouse) | `F` |
| UV wireframe | `W` |
| Polygon fill: box select / box select black | Drag / Ctrl + drag |
| Undo / redo (everything: strokes, moves, deletes, material and mask edits, drops) | Ctrl+Z / Ctrl+Y |
| Select several layers | Ctrl+click (add/remove), Shift+click (range) |
| Group / duplicate / delete selected layers | Ctrl+G / Ctrl+D / Delete |
| Pick several assets on the shelf | Ctrl+click tiles, then drag one or press **Add all** |
| Save project / Export textures | Ctrl+S / Ctrl+Shift+E |
| Leave Baking mode / close a panel | `Esc` |

You can drag files onto the viewport: a model (in Baking mode it becomes the high poly), an `.hdr`, a `.tpaint` project, or preset files.

## How it works

- **3D + UV view.** The 3D model is on the left and the flat texture (UV layout) is on the right. Drag the divider to resize. You can paint in either one. In the UV view, scroll to zoom and right- or middle-drag to pan. When you hover the 3D model, the UV view outlines exactly which texels the brush will touch.
- **Lighting.** *Painter studio* is the default: a dark room with soft boxes, on a dark background, like Substance Painter's viewport. Metals get strong reflections. *Soft studio* is flat, even light where matte colors look exactly like the color you picked. *Contrast studio* is a bright room. You can also load your own .hdr. The Tone map setting defaults to Neutral, which keeps colors accurate; ACES and AgX are filmic options.

- **Layers.** Paint layers hold their own color, roughness, metallic, height and emissive. Fill layers cover the whole model with one material (select one to edit it in the left panel).
- **Brush material.** Tick which channels the brush paints: color, roughness, metallic, height and emissive. Height 0.5 is flat; higher raises, lower carves. Emissive black means no glow; the Glow slider in Viewport sets preview brightness.
- **Painting** uses 3D distance on the surface, so strokes cross UV seams cleanly.
- **Export maps** writes PNGs with presets for Roblox SurfaceAppearance (max 1024, includes an EmissiveMask), generic PBR (OpenGL normals), and Unreal (packed ORM, DirectX normals).
- **Save project** writes a `.tpaint` file containing the model and every layer, losslessly.
- **Roblox emissive:** use the EmissiveMask on the SurfaceAppearance. Roblox glows in the ColorMap color, tinted by EmissiveTint and scaled by EmissiveStrength.

## Substance-style features

- **Mesh maps are baked when you choose, not automatically.** Open the **Baking** tab (top right) and tick the maps you want:
  - Normal
  - World space normal
  - **ID**
  - Ambient occlusion
  - Curvature
  - Position
  - **Thickness**
  - Height

  Then pick the **Output size** (512, 1K, 2K or 4K) and click **Bake selected textures**.

  **AO, curvature and thickness are ray traced, the way Substance's "from mesh" bakers work**, with the same parameters and defaults:
  - **Ambient occlusion:** 64 secondary rays, max occluder distance 0.1 of the bounding box, 180° spread angle, cosine distribution, linear attenuation, optional ground plane.
  - **Curvature:** 32 secondary rays sample the geometry within a *sampling radius* (relative to the bounding box), then the result is tonemapped automatically. Convex edges are white, cavities black, flat areas 50% gray.
  - **Thickness:** rays go into the mesh; white means thick.

  The ray tracing runs on all your CPU cores. *Method → Fast preview (GPU)* gives the old quick approximation. A ✓ shows which maps are baked. Unticked maps keep their last result. Smart masks need their map baked (they show a "Go to Baking" link if it isn't).
- **Smart masks.** Select a layer, then go to **Mask → Add smart mask**:
  - *Edge wear* (convex edges)
  - *Dirt / cavity* (crevices + AO)
  - *Ambient occlusion*
  - *Position gradient* (along X/Y/Z, e.g. dirt rising from the bottom)
  - *Dust* (surfaces facing a direction)
  - *Grunge noise*
  - *Curvature*
  - *Thickness* (thin or thick parts; needs the Thickness map)
  - *ID color selection*: click **Pick color from model**, then click a part. The layer then shows only where the ID map has that color (up to 8 colors, with tolerance). Needs the ID map.

  Each has Amount, Contrast, Noise and Noise size, plus Invert. Masks are computed in 3D, so they're seamless.
- **Paint on masks.** Click a layer's **M** chip (or press **M**). The brush now paints the mask: Paint = white (show), Erase = black (hide). This works on fill layers too, the same as in Substance.
- **Blend modes.** Normal, Multiply, Screen, Overlay, Add, Subtract, Darken, Lighten, and Offset (good for height).
- **Normal channel.** Texture sets with a normal map (OpenGL or DirectX, detected by name) feed a normal channel. It's combined with height into the final normal, which shows in the viewport and exports.
- **Smart materials (.tpsmart).** A smart material is a stack of fill layers plus smart masks, so it adapts to any model. Six come with LMP: Worn Red Paint, Rusty Iron, Worn Gold, Dusty Plastic, Glowing Cracks and Mossy Stone. To make your own, build layers, then click **Presets → Save smart**.
- **Baked AO** shades the viewport (AO shading slider) and exports as an AO map and in Unreal's ORM.

## Baking high poly → low poly

Switch to **Baking** mode (top right tab, the bake icon on the right strip, or Mode → Baking). The left panel lists the maps (tick the ones to bake: unticked maps keep their last result) and **Common parameters** (output size, high poly, cage). Click a map to see its settings and show it in the 2D view.

1. **Load high poly…** Pick your detailed model (GLB, FBX or OBJ; it doesn't need UVs). It has to be exported from the same scene as the low poly, at the same position and scale. With the built-in rounded box you can click **Demo** to try a detailed sci-fi version.
2. **Set the ray distance (the cage).**
   - The **blue shell** is the *frontal* distance: rays start there and shoot inward.
   - The **red shell** is the *rear* distance: how far behind the low poly they keep searching.
   - All the high poly's detail should sit between blue and red.
   - **Average normals** keeps the cage closed on hard-edged models.
   - **Show high poly** swaps the view to the high poly for comparison.
3. **Bake selected textures.** High → low is optional: with no high poly, or with *Use low poly mesh as high poly* ticked, every map is baked from the low poly.
   **ID map source:**
   - Auto, the default: objects, else mesh parts, else UV islands.
   - Mesh part, UV island, object, or material.
   - Vertex color, if the model has vertex colors.
4. **Results.** You get a **normal map** and **height** from the high poly, plus **AO** and **curvature** of the high poly, all mapped onto the low poly's UVs.
5. **Ray check** (shown in the 2D view when Common parameters is selected) shows blue where a ray found the high poly and **red where it missed**. Raise the distances there and bake again. If rays hit the wrong surface instead (smeared details), lower them.

The baked normal is the base of the final normal: height and normal-channel layers stack on top, in the viewport and in exports. Smart masks (edge wear, dirt…) use the high poly's curvature and AO, so they follow the bolts and grooves.

Baked maps are saved inside the `.tpaint` project, so you don't need the high poly after baking.

## Substance materials (.sbsar / .spsm)

**Drag a .sbsar or .spsm onto LMP**, or click one in Assets → Substance. LMP opens the file and translates it into layers. Substance Painter isn't needed.

- **.sbsar**: LMP reads the file's name, description, outputs and sliders. A procedural one becomes a small look-alike folder: Base, a Variation layer with a noise mask, and a glowing layer for emissive materials like lava.
  - **If texture pictures are stored inside** (common for scanned materials), they become the layer's color, roughness, normal and other maps.
  - **If the material is procedural**, its pattern is a compiled program that only Adobe's engine can run. LMP then makes an **approximation**: a fill layer with the right kind of color, roughness and metal, taken from its sliders and its name or category (stone, gold, wood…).
- **.spsm** (smart material): LMP reads the whole layer stack. You get a folder with the same layers, names, order, opacities and blend modes.
  - **Colors and values** set in each layer (base color, roughness, metal, height, emissive) come over exactly.
  - **Materials inside it** (e.g. Granite Rock Mossy) use the texture previews Substance stored in the file. That's the material at its default settings, 512 px.
  - **Grunge maps** become real picture masks.
  - **Mask generators** become LMP smart masks: MG Dirt → Dirt, edge wear → Edge wear, Mask Builder / Mask Editor → the closest one. Bake mesh maps in the Baking tab so they show.
  - **Not carried over:** filters (blur, sharpen), hand-painted strokes, and extra generators beyond the first on a mask. The message after translating lists what was skipped.
- The layer's **Properties → Source** shows what was read and what was guessed.
- Refine the result with the fill settings (projection, scale, adjustments) and smart masks, then **Save material** to keep it.
- **.spp, .sppr and other Substance files** can't be translated.

## Presets folder

LMP loads the **presets** folder next to LMP.exe automatically. The folder icon under the Assets shelf opens it; after adding files, click Rescan.

- **Image materials (.tptex):** one file holding all the maps plus placement and adjustments. **Save material** with an image fill layer selected makes one.
- **Material presets (.tpmat):** click to load into the brush, or into the selected fill layer. **Save material** adds your own.
- **Texture sets (PNG/JPG):** files are grouped by suffix (`Brick_BaseColor.png`, `Brick_Roughness.png`, `_Metallic`, `_Height`, `_Emissive`…). Click a set to add it as a fill layer with a Tiling control. Normal maps are recognised but not used yet.
- **Substance files** show up under the Substance chip. Click a .sbsar or .spsm to translate it (see above); .spp and .sppr can't be read.

## Limits of this prototype

- One texture set: all meshes share one UV space, and UVs must be in 0–1 without overlaps.
- The Material Designer makes tileable 2D textures; mesh-map driven wear goes in smart masks. Graph edits aren't part of Ctrl+Z (layer changes are).
- TextureCraft's extra lobes (clear coat, sheen, transmission, subsurface) aren't in LMP, so glass, velvet and car paint use their base look.
- High-poly baking runs on the CPU. Very dense high polys (several million triangles) at 2048 px can take a minute.
- Smart materials converted from Substance keep only their flat look; rebuild the wear with LMP's smart masks.

## Source code

The `source` folder has the full project (TypeScript + three.js). Opening .sbsar / .spsm uses 7-Zip (7z-wasm, LGPL), built into LMP.html. Its licence is in `THIRD-PARTY-7zip.txt`.
Bakers, noise, patterns, smart masks, materials and brush alphas are ported from TextureCraft (MIT / Apache-2.0); see `THIRD-PARTY-TextureCraft.txt`. The Poly Haven textures and HDRIs are CC0 (public domain).
To rebuild after changes: install Node.js, then in `source` run `npm install` and `npm run build`.
The desktop app is Electron 33. Its code is in `source/desktop` (main.js, preload.js). To update the app, copy `dist/index.html` to `resources/app/LMP.html`.
The result is `source/dist/index.html`.
