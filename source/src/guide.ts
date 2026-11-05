/**
 * LMP Guide: short how-to guides plus an offline "smart" search that understands
 * everyday wording ("how do i make my brush go smoothly like guiding a path"),
 * synonyms and typos.
 */
import { VERSION } from './version';

/** A "Show me" button: the app runs `act` (switch tool, open a panel…) and then highlights `hl`. */
export interface GuideShow { label: string; act?: string; hl?: string; text?: string }
export interface GuideBlock { h?: string; p?: string; steps?: string[]; tips?: string[]; table?: [string, string][] }
export interface Guide {
  id: string;
  title: string;
  cat: string;
  /** One line under the title (also shown in search results). */
  sum: string;
  /** Concepts this guide answers (see SYN), plus any extra keywords. */
  tags: string[];
  words?: string;
  body: GuideBlock[];
  show?: GuideShow[];
  related?: string[];
}

export const CATS = ['Start here', 'Basics', 'Painting', 'Layers & materials', 'Baking', 'Material Designer', 'Export', 'Help & settings'];

export const GUIDES: Guide[] = [
  // ------------------------------------------------------------------ start here
  {
    id: 'getting-started', title: 'Getting started', cat: 'Start here',
    sum: 'What LMP is, how it works and how to set it up.',
    tags: ['start', 'basics', 'tutorial', 'new', 'setup', 'substance'],
    words: 'begin beginner first time intro introduction learn welcome overview how works familiar controls',
    body: [
      { p: 'This is a personal and free alternative to paid material painting programs like **Substance Painter**. The controls are kept familiar, so if you have used Substance before most things work the same way here.' },
      { h: 'How it works', p: 'You open a 3D model and paint materials on it. A material is more than a colour. It also has roughness, metal, height and glow, and the brush paints all of them at once. Your work is made of layers. A paint layer is for painting by hand. A fill layer covers the model with one material, and a mask decides where it shows. Smart materials (rust, worn paint and so on) look at the shape of the model to put wear on the edges and dirt in the gaps. That is why you bake the mesh maps first. When you are done you export the textures for Roblox, Unreal, Unity or Blender.' },
      { h: 'Setting up', steps: [
        'Open a model. Pick one on the start screen or use File > Open model (FBX, OBJ or GLB). The model has to be UV unwrapped.',
        'Bake the mesh maps. Click Baking at the top right, then Bake selected textures.',
        'Paint. Drag a smart material from the Assets shelf onto the model, or press B and paint on a paint layer.',
        'Save and export. Ctrl+S saves an .lmp project and Ctrl+Shift+E exports the textures.',
      ] },
      { h: 'Controls', table: [
        ['Orbit / pan / zoom', 'Right mouse (or Alt + left) / middle mouse / wheel'],
        ['Paint, eraser, picker', 'B, E, P'],
        ['Brush size, hardness', '[ ]  and  { }   (or Ctrl + right drag)'],
        ['Flow, rotation', 'Ctrl + left drag'],
        ['Straight line', 'Shift + click'],
        ['Paint the layer mask', 'M'],
        ['Polygon fill, path', 'G, L'],
        ['Frame the model', 'F'],
        ['3D / 2D / both', 'F2 / F3 / F4'],
        ['Undo, redo, history', 'Ctrl+Z, Ctrl+Y, H'],
        ['Save, open, export', 'Ctrl+S, Ctrl+O, Ctrl+Shift+E'],
        ['This guide', 'F1'],
      ] },
      { tips: ['You can type a question in the search box at the top, for example "how do I make rust" or "it lags".'] },
    ],
    show: [{ label: 'Assets shelf', hl: '#shelf' }, { label: 'Layers panel', hl: '#right' }],
    related: ['open-model', 'baking', 'smart-materials', 'export'],
  },
  {
    id: 'whats-new', title: `What's new in v${VERSION}`, cat: 'Start here',
    sum: 'Updates, shapes, autosave, history, the Guide and more.',
    tags: ['new', 'update', 'version', 'changelog'], words: 'changes release notes added features latest',
    body: [
      { h: 'New in v2.00', steps: [
        'Scanned materials: 114 real photo-scanned materials (metal, rust, painted metal, sci-fi plates, wood, stone, fabric, leather and more) with colour, roughness, metal, normal and height maps. Each one downloads the first time you use it.',
        'Realistic smart materials built from those scans the way Substance builds them: Rusty Metal, Heavy Rust, Chipped Red Paint, Sci-Fi Panels, Worn Diamond Plate, Old Wood Planks, Mossy Rock and more.',
        'The 3D view is lit by a real studio photo by default, so metals reflect like in Substance. Change it in Display settings.',
        'New guide: how to bring a Substance material into LMP with its exact look.',
      ] },
      { h: 'New in v1.04', steps: [
        'Walk me through it: many guides can now show you how, step by step. A pointer moves to each button and a small note under it says what to do.',
      ] },
      { h: 'New in v1.03', steps: [
        'Updates now download one small file and the GitHub download page is simpler: just download LMP-vX.XX.zip.',
      ] },
      { h: 'New in v1.02', steps: [
        'LMP tells you when a new version is out and can update itself with one click (Update now). If you pick Later, an Update button stays in the top bar.',
        'Shape generator: right click a layer > Add generator > Shape. Pick a circle, star, heart and more, then drag it on the model to move it.',
      ] },
      { h: 'New in v1.00', steps: [
        'Autosave. LMP saves a backup every few minutes, and if it closes by accident it asks to restore it next time.',
        'History panel (H). Shows your last 25 changes. Click one to go back to it.',
        'Start window with your recent projects and autosaves.',
        'Settings (File > Settings) for autosave, texture size, render scale, undo steps and low performance mode.',
        'Smoothing (lazy mouse) for steadier strokes.',
        'Pen pressure for drawing tablets.',
        'Layer thumbnails now show what is painted on each layer.',
        'Smart material previews now show the real material instead of a plain colour.',
        'More brushes, including Gubby.',
        'Overlapping UVs show as dark spots on the model and in the 2D view (press O), so you can find them and fix them in Blender.',
        'This Guide (F1).',
      ] },
      { p: 'The 3D + 2D layout key moved from F1 to F4, since F1 now opens the Guide.' },
    ],
    related: ['autosave', 'history', 'lazy-mouse', 'pen-pressure'],
  },
  {
    id: 'about', title: 'About LMP', cat: 'Start here',
    sum: `Leo's Material Painter v${VERSION}, owned by H9_zy.`,
    tags: ['about', 'credits'], words: 'owner author made creator who license version h9_zy h9zy leo copyright',
    body: [
      { p: `LMP (Leo's Material Painter), version ${VERSION}.` },
      { p: 'This program is owned by **H9_zy**.' },
      { p: 'A personal and free alternative to paid material painting programs. Made with three.js and Electron.' },
    ],
  },

  // ------------------------------------------------------------------ basics
  {
    id: 'navigate', title: 'Moving around the model', cat: 'Basics',
    sum: 'Orbit, pan, zoom, camera views and layouts.',
    tags: ['camera', 'view', 'layout'], words: 'rotate orbit turn spin pan move zoom scroll frame center focus look around front back top side 2d 3d split',
    body: [
      { steps: [
        'Hold the right mouse button and drag to orbit (Alt + left drag also works).',
        'Hold the middle mouse button and drag to pan.',
        'Scroll to zoom.',
        'Press F to fit the model in view. With the mouse over the 2D view it fits the texture instead.',
        'Number keys 1 to 9 and 0 switch to front, back, side and top views.',
        'F2 shows only 3D, F3 only 2D, F4 both.',
      ] },
    ],
    show: [{ label: 'Layout buttons', hl: '#toolbar .tb-right' }],
  },
  {
    id: 'open-model', title: 'New file / opening a model', cat: 'Basics',
    sum: 'Open an FBX, OBJ or GLB model, or start with a built in shape.',
    tags: ['new', 'open', 'model', 'import'], words: 'fbx obj glb gltf mesh load file start blender roblox character uv',
    body: [
      { steps: [
        'Pick a model on the start screen, use File > Open model, or drag the model file into the 3D view.',
        'New files use the texture size set in File > Settings (1024 unless you change it).',
        'The model needs UVs. Unwrap it in Blender or similar first. If it has several materials they share one texture set.',
        'Bake the mesh maps next, otherwise smart materials won\'t look right.',
      ] },
    ],
    show: [{ label: 'Open the start window', act: 'open' }],
    related: ['baking', 'save-open'],
  },
  {
    id: 'save-open', title: 'Saving and opening projects', cat: 'Basics',
    sum: 'Ctrl+S saves everything into one .lmp file.',
    tags: ['save', 'open', 'file'], words: 'project lmp save as keep store recent reopen load double click',
    body: [
      { steps: [
        'Ctrl+S saves. The first time it asks where to put the file. Ctrl+Shift+S is Save as.',
        'The file gets the model and texture set name and ends in .lmp. It holds the model, layers and masks.',
        'Ctrl+O opens a window with your recent projects and autosaves, plus a Browse button.',
        'You can also double click an .lmp file in Windows to open it.',
      ] },
      { tips: ['If you close LMP with unsaved changes it asks if you want to save first.'] },
    ],
    show: [{ label: 'Recent projects', act: 'open' }],
    related: ['autosave'],
  },
  {
    id: 'autosave', title: 'Autosave and getting lost work back', cat: 'Basics',
    sum: 'LMP keeps backups while you work.',
    tags: ['autosave', 'recover', 'crash', 'save'], words: 'backup lost work closed crashed freeze restore auto saved rescue',
    body: [
      { steps: [
        'Every few minutes LMP saves a backup if something changed. You\'ll see "Autosaved" at the bottom for a moment.',
        'If LMP closed without you quitting it, it offers to restore the latest backup when you start it again.',
        'You can open any backup yourself with Ctrl+O > Autosaves.',
        'How often it saves and how many backups it keeps can be changed in File > Settings.',
      ] },
      { tips: ['Backups go in D:\\LMP\\autosave if you have a D: drive, otherwise next to LMP.', 'Opening a backup opens a copy, so your original file stays as it was until you save.'] },
    ],
    show: [{ label: 'Autosaves', act: 'autosaves' }, { label: 'Settings', act: 'settings' }],
    related: ['history', 'settings'],
  },
  {
    id: 'history', title: 'Undo and the History panel', cat: 'Basics',
    sum: 'Ctrl+Z and Ctrl+Y, or press H to see your recent changes.',
    tags: ['undo', 'history'], words: 'mistake oops back revert previous earlier before redo step accidentally go back return restore latest ctrl z',
    body: [
      { steps: [
        'Ctrl+Z undoes and Ctrl+Y redoes.',
        'Press H (or the clock button on the left) to open History. It lists your last 25 changes with the newest at the top.',
        'Click a row to go back to that point. The changes after it turn grey but they\'re still there.',
        'If you pressed Ctrl+Z too many times, click the top row to get back to where you were.',
        '"Original" at the bottom is the file before any of these changes.',
      ] },
      { tips: ['If you go back and then make a new change, the grey rows are dropped.', 'You can change the number of steps in File > Settings.'] },
    ],
    show: [{ label: 'History', act: 'history', hl: '#shelf' }],
    related: ['autosave'],
  },

  // ------------------------------------------------------------------ painting
  {
    id: 'paint-basics', title: 'Painting on the model', cat: 'Painting',
    sum: 'Brush size, flow, opacity, hardness and what the brush paints.',
    tags: ['paint', 'brush'], words: 'draw color colour size bigger smaller hardness soft hard channels roughness metal height first stroke',
    body: [
      { steps: [
        'Select a paint layer in the Layers panel, or click Add paint layer.',
        'Press B and paint with the left mouse button.',
        'Change size with [ and ], hardness with { and }, or hold Ctrl and right drag on the model.',
        'Properties > Material sets what the brush paints (colour, roughness, metal, height, glow). You can turn each one on or off.',
      ] },
      { tips: ['Dragging a material from the shelf onto the Properties panel loads it into the brush.'] },
    ],
    show: [{ label: 'Brush', act: 'tool:paint', hl: '#toolbar' }, { label: 'Brush settings', act: 'props', hl: '#right' }],
    related: ['flow-opacity', 'brush-tips', 'eraser'],
  },
  {
    id: 'flow-opacity', title: 'Flow and stroke opacity', cat: 'Painting',
    sum: 'What the difference is.',
    tags: ['flow', 'opacity', 'brush'], words: 'transparent transparency see through faint light build up strength alpha',
    body: [
      { p: 'Flow is how much paint each dab of the brush adds. With low flow the paint builds up slowly as you go over the same spot.' },
      { p: 'Stroke opacity is the most one stroke can cover. At 50, a single stroke never goes past half, no matter how much you go over it.' },
      { tips: ['Ctrl + left drag sideways changes flow while you paint.', 'With a drawing tablet you can let pen pressure control flow.'] },
    ],
    show: [{ label: 'Sliders', act: 'tool:paint', hl: '#toolbar .tb-scroll' }],
    related: ['pen-pressure'],
  },
  {
    id: 'lazy-mouse', title: 'Smoother strokes (lazy mouse)', cat: 'Painting',
    sum: 'The brush follows the cursor on a string, so lines come out less shaky.',
    tags: ['smoothing', 'brush', 'line', 'stroke'],
    words: 'smooth smoothly steady stable stabilizer stabiliser shaky wobbly jitter jittery lazy mouse string guide guiding follow trail clean neat calm hand shake',
    body: [
      { steps: [
        'Press B for the brush.',
        'Turn up Smoothing in the toolbar (it\'s also in Properties > Brush). Around 20 to 40 works well.',
        'When you paint, a dotted line shows between the cursor and the brush. The brush only moves once the line is pulled tight, so small wobbles don\'t show.',
        'Set it back to off when you don\'t need it.',
      ] },
      { tips: ['To paint along an exact curve, use the Path tool (L).', 'Shift + click draws a straight line.'] },
    ],
    show: [{ label: 'Smoothing', act: 'tool:paint', hl: '#toolbar .inline-slider', text: 'Smoothing' }],
    related: ['path-tool', 'straight-lines'],
  },
  {
    id: 'path-tool', title: 'Painting along a path', cat: 'Painting',
    sum: 'Click points to make a curve and the brush follows it.',
    tags: ['path', 'line', 'smoothing', 'stroke'],
    words: 'bezier curve curved follow guide guiding along path spline seam stitch trace outline route line tool handles',
    body: [
      { steps: [
        'Press L or click the path button on the left.',
        'Click on the model to add points. Click and drag to pull out handles and bend the curve.',
        'The brush paints along the curve while you edit, so you can see what you\'ll get. Drag points or handles to change it.',
        'Press Enter or double click to finish. Esc cancels and Delete removes the selected point.',
      ] },
      { tips: ['Useful for stitches, seams, cables and stripes. Turn on "Follow stroke" in the brush tip settings so the tip turns with the curve.', 'It works in the 2D view too.'] },
    ],
    show: [{ label: 'Path tool', act: 'tool:path', hl: '#toolstrip button[title^="Path"]' }],
    related: ['lazy-mouse', 'straight-lines', 'brush-tips'],
  },
  {
    id: 'straight-lines', title: 'Straight lines', cat: 'Painting',
    sum: 'Shift + click draws a line from where your last stroke ended.',
    tags: ['line', 'stroke'], words: 'straight shift click ruler connect join dots edge',
    body: [
      { steps: ['Paint a dot or a stroke.', 'Hold Shift and click somewhere else. A straight line joins the two.', 'Keep Shift clicking to carry on the line.'] },
      { tips: ['For curved lines use the Path tool (L).'] },
    ],
    show: [{ label: 'Brush', act: 'tool:paint' }],
    related: ['path-tool', 'lazy-mouse'],
  },
  {
    id: 'symmetry', title: 'Mirror painting', cat: 'Painting',
    sum: 'Paint both sides at once. A red line shows where it mirrors.',
    tags: ['symmetry'], words: 'mirror both sides symmetric symmetrical x y z axis flip reflect copy left right red line plane',
    body: [
      { steps: [
        'Turn on X, Y or Z next to "Sym" in the toolbar. The X key turns X on and off.',
        'A red line on the model shows where the mirror is.',
        'To move it, use the X, Y or Z position slider in Properties > Brush. "Centre the mirror planes" puts it back.',
      ] },
    ],
    show: [{ label: 'Symmetry', act: 'tool:paint', hl: '#toolbar .sym-wrap' }],
  },
  {
    id: 'pen-pressure', title: 'Drawing tablets and pen pressure', cat: 'Painting',
    sum: 'Press harder to make the brush bigger or stronger.',
    tags: ['pressure', 'brush'], words: 'pen tablet wacom huion xp-pen stylus pressure sensitivity draw hard soft surface ipad',
    body: [
      { steps: [
        'Plug in your tablet. LMP picks up the pressure by itself.',
        'In Properties > Brush, turn on Size and/or Flow next to Pen pressure.',
        'Press lightly for thin, light strokes and harder for big, strong ones.',
      ] },
      { tips: ['A mouse always paints at full pressure.'] },
    ],
    show: [{ label: 'Pen pressure', act: 'props', hl: '#right .row', text: 'Pen pressure' }],
    related: ['flow-opacity'],
  },
  {
    id: 'picker', title: 'Eyedropper (picker)', cat: 'Painting',
    sum: 'P picks up the material or colour from the model.',
    tags: ['picker', 'color'], words: 'eyedropper eye dropper drop pick sample copy colour color grab match same',
    body: [
      { steps: [
        'Press P or click the picker on the left.',
        'In the toolbar choose Material (everything) or Color only.',
        'Click on the model or the 2D view. A small swatch next to the cursor shows what you\'re about to pick.',
        'After picking, LMP switches back to the tool you were using.',
      ] },
    ],
    show: [{ label: 'Picker', act: 'tool:picker', hl: '#toolbar' }],
  },
  {
    id: 'eraser', title: 'Eraser', cat: 'Painting',
    sum: 'E switches to the eraser.',
    tags: ['erase'], words: 'eraser rubber remove delete clear undo paint wipe',
    body: [
      { steps: ['Press E. Press it again to go back to the brush.', 'Paint over what you want to remove.', 'On a mask the eraser paints black, which hides the layer there.'] },
    ],
    show: [{ label: 'Eraser', act: 'tool:erase' }],
    related: ['masks'],
  },
  {
    id: 'brush-tips', title: 'Brush tips and alphas', cat: 'Painting',
    sum: 'Change the brush shape and add some randomness.',
    tags: ['brush', 'alpha', 'tip'], words: 'shape stamp alpha texture grunge splatter scratch dots rotation rotate angle jitter random scatter follow stroke spacing custom image',
    body: [
      { steps: [
        'With the brush selected, go to Properties > Brush tip.',
        'Pick a tip, or click Import tip to use your own black and white image.',
        'Rotation, Follow stroke, angle jitter, size jitter and scatter make it look less repetitive.',
        'Spacing (in Properties > Brush) is the gap between each dab.',
      ] },
    ],
    show: [{ label: 'Brush tips', act: 'props', hl: '#right' }],
    related: ['brushes'],
  },
  {
    id: 'brushes', title: 'Brush presets', cat: 'Painting',
    sum: 'Ready made brushes on the shelf, and saving your own.',
    tags: ['brush'], words: 'gubby bunny funny preset presets brushes dirt chalk spray leaks rust tape hair fur fibers wood grain smudge pencil airbrush save brush',
    body: [
      { steps: [
        'Open Brushes on the Assets shelf on the left.',
        'Click one to load its tip and settings.',
        'If you set up a brush you like, click Save brush in Properties to keep it.',
      ] },
    ],
    show: [{ label: 'Brushes', act: 'shelf:brush', hl: '.shelf-sec', text: 'Brushes' }],
    related: ['brush-tips'],
  },
  {
    id: 'quick-adjust', title: 'Resizing the brush quickly', cat: 'Painting',
    sum: 'Hold Ctrl and drag on the model.',
    tags: ['brush', 'size'], words: 'resize bigger smaller ctrl drag hardness rotation quick adjust radius',
    body: [
      { table: [['Size', 'Ctrl + right drag left/right'], ['Hardness', 'Ctrl + right drag up/down'], ['Flow', 'Ctrl + left drag left/right'], ['Rotation', 'Ctrl + left drag up/down'], ['Size in steps', '[  ]'], ['Hardness in steps', '{  }']] },
    ],
  },
  {
    id: 'paint-2d', title: 'Painting in the 2D view', cat: 'Painting',
    sum: 'Paint straight onto the flat texture.',
    tags: ['uv', 'layout'], words: '2d flat texture uv view wireframe islands unwrap',
    body: [
      { steps: ['Press F4 for 3D and 2D side by side, or F3 for only 2D.', 'Paint in the 2D view the same way. Scroll zooms and the middle mouse pans.', 'W shows the UV wireframe.'] },
    ],
    show: [{ label: '3D + 2D', act: 'layout:split' }],
  },
  {
    id: 'uv-overlap', title: 'Overlapping UVs (dark spots)', cat: 'Painting',
    sum: 'Find the places where UV pieces sit on top of each other.',
    tags: ['uv', 'model'], words: 'overlap overlapping overlaps uv uvs stacked dark black spots spot error problem paints twice both places mirrored seams blender unwrap fix wrong bad',
    body: [
      { p: 'If two parts of the model use the same spot on the texture, painting one also paints the other, and baking can look wrong there. LMP checks this when you open a model.' },
      { steps: [
        'Press O (or the overlap button next to the wireframe button at the top right).',
        'Overlapping parts show as dark spots on the model and in the 2D view. The more pieces stack up, the darker it gets.',
        'Fix those faces in Blender (move or re-unwrap them so they don\'t share space), export the model again and reopen it.',
      ] },
      { tips: ['Mirrored halves that share one UV piece also show up. That is fine if you want both sides to look the same.'] },
    ],
    show: [{ label: 'UV overlaps', act: 'overlap' }],
    related: ['paint-2d', 'open-model'],
  },
  {
    id: 'shapes', title: 'Shapes (move a shape on the model)', cat: 'Layers & materials',
    sum: 'A mask generator that puts a circle, star, heart and more on the model.',
    tags: ['shape', 'mask', 'smart'], words: 'shape shapes circle square star heart triangle hexagon ring diamond cross plus sticker decal logo spot move drag place position generator projection stencil',
    body: [
      { steps: [
        'Right click a layer and choose Add generator > Shape (circle, star…). The layer now only shows inside the shape.',
        'Drag on the 3D view to move the shape. It turns to face whatever surface you drag over. Press Esc or Done when it\'s in place.',
        'In Properties change the shape, size, stretch, rotation and how hard the edge is. Tick Invert to cut the shape out instead.',
        'To move it again later, select the layer\'s mask and click "Move: drag it on the model".',
      ] },
      { tips: ['You can add a shape to an existing mask too: Properties > Mask effects > Add effect > Generator: Shape. Multiply cuts it out of the mask, Lighten adds it.'] },
    ],
    related: ['masks', 'smart-masks'],
  },
  {
    id: 'poly-fill', title: 'Filling a whole part', cat: 'Painting',
    sum: 'G fills a triangle, UV island, part or the whole object.',
    tags: ['fill', 'mask'], words: 'polygon fill bucket island part object triangle face select whole area paint bucket',
    body: [
      { steps: [
        'Press G.',
        'In the toolbar choose Triangle, UV island, Mesh part or Object.',
        'Click on the model, or drag a box. Hold Ctrl to remove instead.',
        'If a mask is selected it fills the mask. This is an easy way to put a material on just one part.',
      ] },
    ],
    show: [{ label: 'Polygon fill', act: 'tool:fill', hl: '#toolbar' }],
    related: ['masks'],
  },

  // ------------------------------------------------------------------ layers & materials
  {
    id: 'layers', title: 'Layers and folders', cat: 'Layers & materials',
    sum: 'Paint layers, fill layers, folders, blend modes and opacity.',
    tags: ['layer'], words: 'layers folder group stack order blend mode opacity hide show duplicate delete rename reorder paint layer fill layer',
    body: [
      { steps: [
        'Add paint layer is for painting by hand. Add fill layer covers the model with one material.',
        'Drag layers up and down to change the order. The top one is drawn on top.',
        'Each layer has its own blend mode and opacity.',
        'Ctrl or Shift click to select several. Ctrl+G puts them in a folder, Ctrl+D duplicates and Delete removes them.',
      ] },
      { tips: ['The small picture on each layer shows what is painted on it.'] },
    ],
    show: [{ label: 'Layers panel', hl: '#right' }],
    related: ['masks', 'materials'],
  },
  {
    id: 'masks', title: 'Masks', cat: 'Layers & materials',
    sum: 'A mask shows the layer where it is white and hides it where it is black.',
    tags: ['mask', 'layer'], words: 'mask black white hide reveal only some parts where paint mask selective area',
    body: [
      { steps: [
        'Right click a layer and choose Add black mask. The layer disappears.',
        'Press M (or click the mask thumbnail) and paint white where you want the layer to show.',
        'The eraser paints black. G fills whole parts of the mask.',
        'Press M again to go back to painting the layer itself.',
      ] },
    ],
    show: [{ label: 'Mask button', hl: '#toolstrip' }],
    related: ['smart-masks', 'poly-fill'],
  },
  {
    id: 'smart-masks', title: 'Smart masks', cat: 'Layers & materials',
    sum: 'Masks that follow the shape of the model, like edge wear or dirt.',
    tags: ['mask', 'smart', 'wear'], words: 'smart mask generator edge wear scratched edges dirt cavity ambient occlusion dust grunge curvature thickness gradient procedural automatic',
    body: [
      { steps: [
        'Bake the mesh maps first (Baking at the top right).',
        'Drag a smart mask from the shelf onto a layer, or choose one for the layer\'s mask in Properties.',
        'Move the sliders until it looks right.',
      ] },
    ],
    show: [{ label: 'Smart masks', act: 'shelf:mask', hl: '.shelf-sec', text: 'Smart masks' }],
    related: ['baking', 'smart-materials'],
  },
  {
    id: 'smart-materials', title: 'Smart materials', cat: 'Layers & materials',
    sum: 'Ready made materials like rust or worn paint that you drag onto the model.',
    tags: ['smart', 'material', 'wear'], words: 'smart material rust rusty worn old dirty scratched metal painted leather wood plastic aged weathered realistic drag drop',
    body: [
      { steps: [
        'Bake the mesh maps first so the wear ends up on the edges and the dirt in the gaps.',
        'Open Smart materials on the Assets shelf.',
        'Drag one onto the model, onto one part of it, or into the Layers panel.',
        'It comes in as a folder of layers you can change.',
        'To make your own, select your layers and click Save as smart material.',
      ] },
      { tips: ['The previews on the shelf are made with the real layers, so they show what you\'ll actually get.'] },
    ],
    show: [{ label: 'Smart materials', act: 'shelf:smart', hl: '.shelf-sec', text: 'Smart materials' }],
    related: ['baking', 'drop-on-mesh'],
  },
  {
    id: 'materials', title: 'Materials and fill layers', cat: 'Layers & materials',
    sum: 'Cover a layer with a material and change how it tiles.',
    tags: ['material', 'fill'], words: 'material fill layer tile tiling scale triplanar projection uv rotate offset hue saturation pbr metal wood stone fabric',
    body: [
      { steps: [
        'Drag a material from Materials onto the model or the Layers panel. It becomes a fill layer.',
        'In Properties you can change the scale and rotation, switch to Tri-planar to hide seams, and adjust the colour.',
        'Add a mask if you only want it in some places.',
      ] },
    ],
    show: [{ label: 'Materials', act: 'shelf:material', hl: '.shelf-sec', text: 'Materials' }],
    related: ['masks', 'import-images'],
  },
  {
    id: 'import-images', title: 'Using your own images', cat: 'Layers & materials',
    sum: 'Drop in PNG or JPG files and say what each one is.',
    tags: ['import', 'image', 'material'], words: 'image png jpg jpeg photo picture texture drag drop import basecolor albedo diffuse normal map height roughness metallic decal sticker logo',
    body: [
      { steps: [
        'Drag image files into LMP, or press Ctrl+I.',
        'For each image choose Color, Normal, Height, Roughness, Metallic and so on. LMP guesses from the file name.',
        'Then choose where it goes: a new fill layer, the selected fill layer, a brush tip, or just the shelf.',
      ] },
    ],
    show: [{ label: 'Import', act: 'import' }],
    related: ['materials'],
  },
  {
    id: 'drop-on-mesh', title: 'Putting a material on one part', cat: 'Layers & materials',
    sum: 'Drop a material on a part and it only goes on that part.',
    tags: ['material', 'fill', 'mask'], words: 'part piece only one section handle blade object id drop on mesh specific area',
    body: [
      { steps: ['Drag a material from the shelf over the model. The part under the cursor lights up.', 'Let go. The new fill layer gets a mask that only covers that part.', 'You can also use G (polygon fill) on a mask.'] },
    ],
    related: ['poly-fill', 'masks'],
  },
  {
    id: 'from-substance', title: 'Bring a Substance material into LMP (exact look)', cat: 'Layers & materials',
    sum: 'Export it from Substance Painter as pictures, then drop those into LMP.',
    tags: ['substance', 'import', 'material', 'image', 'export'],
    words: 'substance painter sbsar spsm smart material exact same look identical copy convert bake export textures adobe my own',
    body: [
      { p: 'Substance materials (.sbsar, .spsm) only run inside Adobe\'s own engine, so LMP can only guess at them. For the exact look, let Substance make the pictures and give those to LMP.' },
      { h: 'In Substance Painter', steps: [
        'Make a new project with a flat plane (a 1 × 1 plane from Blender works) and a texture size like 2048.',
        'Drag the material or smart material onto it.',
        'File > Export Textures. Pick the "PBR Metallic Roughness" preset, choose a folder and click Export.',
      ] },
      { h: 'In LMP', steps: [
        'Drag all the exported pictures onto LMP at once (or Ctrl+I and pick them).',
        'LMP recognises Base Color, Roughness, Metallic, Normal and Height from the names. Choose "New fill layer".',
        'In Properties set the tiling and switch Projection to Tri-planar so it wraps around your model without seams.',
      ] },
      { tips: ['Choose "Add to Assets shelf only" instead, and the material stays on your shelf to use again.', 'Want smart-material wear on top? Add LMP\'s smart masks (edge wear, dirt) to the layer afterwards.'] },
    ],
    show: [{ label: 'Import pictures', act: 'import' }],
    related: ['import-images', 'materials'],
  },
  {
    id: 'scanned', title: 'Scanned materials', cat: 'Layers & materials',
    sum: 'Real photo-scanned materials that download when you first use them.',
    tags: ['material', 'smart', 'image'], words: 'scan scanned photo realistic real download cloud ambientcg metal rust wood stone concrete fabric leather plastic pbr',
    body: [
      { steps: [
        'Open Scanned materials on the Assets shelf. The ones marked with a download size aren\'t on your PC yet.',
        'Click one or drag it onto the model. The first time, LMP downloads it (a few MB) and keeps it for next time.',
        'It comes in as a fill layer with real colour, roughness, metal, normal and height maps. Add masks to wear it in.',
      ] },
      { tips: ['These are free CC0 scans from ambientCG.com.', 'The "Realistic" smart materials are built from these scans.'] },
    ],
    show: [{ label: 'Scanned materials', act: 'shelf:cloud', hl: '.shelf-sec', text: 'Scanned materials' }],
    related: ['smart-materials', 'materials'],
  },
  {
    id: 'substance-files', title: 'Substance files (.sbsar, .spsm)', cat: 'Layers & materials',
    sum: 'Drop Substance files in and LMP converts what it can.',
    tags: ['substance', 'import'], words: 'sbsar spsm substance painter designer adobe convert translate smart material import',
    body: [
      { p: 'Drag .sbsar or .spsm files into LMP. It reads the images and settings inside and turns them into LMP materials or smart materials where it can. Anything it can\'t convert is listed on the shelf under Substance.' },
    ],
  },

  // ------------------------------------------------------------------ baking
  {
    id: 'baking', title: 'Baking mesh maps', cat: 'Baking',
    sum: 'Normal, AO, curvature and other maps that smart materials need.',
    tags: ['bake'], words: 'bake baking mesh maps normal ambient occlusion ao curvature thickness position world space id high poly low poly cage ray distance details',
    body: [
      { steps: [
        'Click Baking at the top right.',
        'Tick the maps you want (leaving them all on is fine) and pick a size.',
        'If you have a high poly version of the model, click Load high poly to bake its detail. If parts come out missing, raise Ray distance (cage).',
        'Click Bake selected textures. You can see the progress at the bottom left and on the model.',
        'Press Esc to go back to painting.',
      ] },
      { tips: ['Smart materials and smart masks use these maps.'] },
    ],
    show: [{ label: 'Baking', act: 'mode:bake' }],
    related: ['smart-materials', 'smart-masks'],
  },

  // ------------------------------------------------------------------ designer
  {
    id: 'designer', title: 'Material Designer and Shader Maker', cat: 'Material Designer',
    sum: 'Make your own tiling materials with nodes.',
    tags: ['designer', 'material'], words: 'node nodes graph designer procedural noise pattern shader maker script code glsl make my own custom material generator',
    body: [
      { steps: [
        'Click Material Designer at the top right.',
        'Add nodes (noise, patterns, blend, levels and so on) and connect them to the outputs.',
        'The result shows on the model right away as a fill layer.',
        'Shader Maker lets you write a small shader for things the nodes can\'t do.',
      ] },
    ],
    show: [{ label: 'Material Designer', act: 'mode:design' }],
  },

  // ------------------------------------------------------------------ export
  {
    id: 'export', title: 'Exporting textures', cat: 'Export',
    sum: 'Ctrl+Shift+E saves the textures as PNG files.',
    tags: ['export'], words: 'export save textures png images output maps finished done unity unreal blender godot game engine',
    body: [
      { steps: [
        'Press Ctrl+Shift+E, or the export button on the right edge.',
        'Pick a preset: Roblox, PBR (Blender, Unity) or Unreal.',
        'Pick a size and click Export.',
      ] },
    ],
    show: [{ label: 'Export', act: 'export' }],
    related: ['roblox'],
  },
  {
    id: 'roblox', title: 'Exporting for Roblox', cat: 'Export',
    sum: 'Textures for a SurfaceAppearance, up to 1024.',
    tags: ['export', 'roblox'], words: 'roblox studio surfaceappearance surface appearance pbr meshpart colormap normalmap roughnessmap metalnessmap',
    body: [
      { steps: [
        'Press Ctrl+Shift+E and choose Roblox SurfaceAppearance.',
        'Roblox only allows textures up to 1024 x 1024, so LMP keeps the size at or below that.',
        'In Roblox Studio, put a SurfaceAppearance inside your MeshPart and set ColorMap, NormalMap, RoughnessMap and MetalnessMap to the exported files.',
        'If you painted glow, use the EmissiveMask file and set EmissiveStrength and EmissiveTint.',
      ] },
    ],
    show: [{ label: 'Export', act: 'export' }],
  },

  // ------------------------------------------------------------------ help & settings
  {
    id: 'display', title: 'Lighting and display', cat: 'Help & settings',
    sum: 'Environment light, background and tone mapping.',
    tags: ['display'], words: 'light lighting environment hdr hdri background dark bright exposure tone mapping view look shadows',
    body: [
      { steps: ['Click Display settings on the right edge (or Viewport > Display settings).', 'Pick an environment, or drop in your own .hdr file.', 'Change the exposure, rotation and tone mapping.'] },
    ],
    show: [{ label: 'Display settings', act: 'display' }],
  },
  {
    id: 'settings', title: 'Settings', cat: 'Help & settings',
    sum: 'Autosave, texture size, render scale, undo steps and low performance mode.',
    tags: ['settings', 'performance'], words: 'settings options preferences config configure change default size',
    body: [
      { p: 'Go to File > Settings. Changes are kept for next time.' },
    ],
    show: [{ label: 'Settings', act: 'settings' }],
    related: ['performance'],
  },
  {
    id: 'performance', title: 'LMP is slow or laggy', cat: 'Help & settings',
    sum: 'Things you can turn down to make it run better.',
    tags: ['performance'], words: 'slow lag laggy lagging stutter freeze fps weak computer device laptop old pc fast faster speed performance low end crash memory',
    body: [
      { steps: [
        'Turn on Low performance mode in File > Settings.',
        'Set Render scale to 1x.',
        'Use 1024 or 2048 textures instead of 4096.',
        'Lower the undo steps. Fewer steps use less memory.',
      ] },
    ],
    show: [{ label: 'Settings', act: 'settings' }],
    related: ['settings'],
  },
  {
    id: 'updates', title: 'Updating LMP', cat: 'Help & settings',
    sum: 'LMP checks for new versions and can update itself.',
    tags: ['update', 'settings'], words: 'update updates upgrade new version newer latest outdated out of date download github release check',
    body: [
      { steps: [
        'When LMP starts it asks GitHub if there is a newer version. If there is, a window tells you what\'s new.',
        'Click Update now. LMP downloads only the changed files (a few MB), then restarts. Your projects and autosaves aren\'t touched.',
        'If you click Later, an orange Update button stays in the top bar next to the Guide button until you update.',
        'You can check yourself any time with File > Check for updates, and turn the start check off in File > Settings.',
      ] },
      { tips: ['The full download page is github.com/LeoDevRX/LMP/releases.'] },
    ],
    show: [{ label: 'Check for updates', act: 'updates' }],
  },
  {
    id: 'shortcuts', title: 'Keyboard shortcuts', cat: 'Help & settings',
    sum: 'All the keys in one list.',
    tags: ['shortcut'], words: 'keys keyboard shortcuts hotkeys hotkey controls list buttons',
    body: [{ p: 'Click the button below to see the full list.' }],
    show: [{ label: 'Shortcuts', act: 'shortcuts' }],
  },
];

// ====================================================================== search

/** Concept → the words people actually type for it. */
const SYN: Record<string, string[]> = {
  smoothing: ['smooth', 'smoothly', 'smoothing', 'steady', 'stable', 'stabilize', 'stabilizer', 'stabiliser', 'shaky', 'wobbly', 'wobble', 'jitter', 'jittery', 'lazy', 'string', 'trail', 'neat', 'clean', 'shake', 'precise'],
  path: ['path', 'paths', 'bezier', 'curve', 'curves', 'curved', 'spline', 'follow', 'following', 'guide', 'guiding', 'along', 'trace', 'route', 'seam', 'stitch', 'stitches'],
  line: ['line', 'lines', 'straight', 'ruler', 'connect'],
  undo: ['undo', 'undid', 'mistake', 'oops', 'revert', 'back', 'previous', 'before', 'earlier', 'redo', 'accidentally', 'accident', 'wrong'],
  history: ['history', 'steps', 'jump', 'list'],
  autosave: ['autosave', 'autosaved', 'backup', 'backups', 'auto'],
  recover: ['recover', 'recovery', 'restore', 'lost', 'lose', 'rescue', 'gone', 'disappeared'],
  crash: ['crash', 'crashed', 'crashes', 'closed', 'froze', 'freeze', 'shutdown'],
  save: ['save', 'saving', 'saved', 'keep', 'store'],
  open: ['open', 'opening', 'load', 'reopen', 'recent'],
  new: ['new', 'start', 'fresh', 'begin', 'create', 'blank'],
  model: ['model', 'mesh', 'fbx', 'obj', 'glb', 'gltf', 'object', 'character', '3d'],
  import: ['import', 'drag', 'drop', 'bring', 'insert'],
  image: ['image', 'images', 'png', 'jpg', 'jpeg', 'photo', 'picture', 'texture', 'textures', 'decal', 'sticker', 'logo'],
  symmetry: ['symmetry', 'symmetric', 'mirror', 'mirrored', 'mirroring', 'both', 'sides', 'flip', 'reflect'],
  pressure: ['pressure', 'pen', 'tablet', 'wacom', 'huion', 'stylus', 'sensitivity', 'sensitive'],
  picker: ['picker', 'eyedropper', 'dropper', 'pick', 'sample', 'grab', 'eye'],
  color: ['color', 'colour', 'colors', 'colours', 'paint', 'tint', 'hue'],
  erase: ['erase', 'eraser', 'rubber', 'remove', 'wipe'],
  brush: ['brush', 'brushes', 'stroke', 'strokes', 'draw', 'drawing'],
  alpha: ['alpha', 'alphas', 'stamp', 'tip', 'tips', 'grunge', 'splatter'],
  shape: ['shape', 'shapes', 'circle', 'square', 'star', 'heart', 'triangle', 'hexagon', 'ring', 'diamond', 'decal', 'sticker', 'generator'],
  size: ['size', 'bigger', 'smaller', 'radius', 'resize', 'big', 'small', 'width', 'thick', 'thin'],
  flow: ['flow', 'build', 'buildup'],
  opacity: ['opacity', 'transparent', 'transparency', 'faint', 'strength', 'see'],
  paint: ['paint', 'painting', 'draw', 'colour'],
  fill: ['fill', 'shape', 'shapes', 'circle', 'star', 'heart', 'decal', 'sticker', 'bucket', 'polygon', 'island', 'part', 'parts', 'whole', 'triangle', 'face'],
  layer: ['layer', 'layers', 'folder', 'group', 'blend', 'stack', 'order', 'reorder'],
  mask: ['mask', 'masks', 'masking', 'hide', 'reveal', 'only', 'black', 'white'],
  smart: ['smart', 'automatic', 'auto', 'procedural', 'generator'],
  wear: ['wear', 'worn', 'rust', 'rusty', 'dirt', 'dirty', 'scratch', 'scratches', 'scratched', 'old', 'aged', 'weathered', 'damage', 'damaged', 'edges', 'edge', 'cavity', 'dust', 'grime'],
  material: ['material', 'materials', 'pbr', 'metal', 'wood', 'stone', 'leather', 'plastic', 'fabric', 'gold', 'concrete'],
  bake: ['bake', 'baking', 'baked', 'normal', 'ao', 'occlusion', 'curvature', 'thickness', 'highpoly', 'cage', 'ray'],
  designer: ['designer', 'node', 'nodes', 'graph', 'graphs', 'shader', 'script', 'scripting', 'code', 'glsl', 'custom'],
  export: ['export', 'exporting', 'output', 'unity', 'unreal', 'blender', 'godot', 'engine', 'game', 'finished', 'done'],
  roblox: ['roblox', 'studio', 'surfaceappearance', 'meshpart', 'rbx'],
  display: ['display', 'light', 'lighting', 'environment', 'hdr', 'hdri', 'background', 'exposure', 'dark', 'bright', 'tone'],
  camera: ['camera', 'rotate', 'orbit', 'turn', 'spin', 'pan', 'zoom', 'frame', 'center', 'focus', 'around', 'navigate', 'move'],
  view: ['view', 'views', 'front', 'top', 'side'],
  layout: ['layout', '2d', 'split', 'fullscreen'],
  uv: ['uv', 'uvs', 'unwrap', 'flat', 'wireframe', 'overlap', 'overlapping', 'overlaps', 'stacked'],
  settings: ['settings', 'setting', 'options', 'preferences', 'config', 'configure', 'default'],
  performance: ['performance', 'slow', 'lag', 'laggy', 'lagging', 'stutter', 'fps', 'weak', 'laptop', 'speed', 'faster', 'fast', 'heavy', 'memory'],
  shortcut: ['shortcut', 'shortcuts', 'hotkey', 'hotkeys', 'keys', 'keyboard', 'key'],
  substance: ['substance', 'sbsar', 'spsm', 'adobe', 'painter'],
  start: ['start', 'started', 'begin', 'beginner', 'tutorial', 'intro', 'learn', 'basics', 'first', 'howto', 'help', 'welcome'],
  setup: ['setup', 'set', 'install', 'configure'],
  about: ['about', 'credits', 'credit', 'owner', 'owned', 'author', 'made', 'creator', 'version', 'h9_zy', 'h9zy', 'h9'],
  update: ['update', 'updates', 'updating', 'upgrade', 'changelog', 'changes', 'whats', 'latest', 'release', 'outdated', 'version', 'newer'],
  tip: ['tip', 'tips'],
};

/** Multi-word phrases that mean one thing. */
const PHRASES: [RegExp, string[]][] = [
  [/go(ing)? back|step back|take back|ctrl ?\+? ?z|before i|earlier version|undo/, ['undo', 'history']],
  [/straight line/, ['line']],
  [/(follow|along|guid\w*|trac\w*) (a |the )?(path|line|curve|edge|seam)/, ['path', 'smoothing']],
  [/lazy mouse|steady hand|shaky hand/, ['smoothing']],
  [/eye ?drop|colou?r pick|pick (a |the )?colou?r/, ['picker']],
  [/edge wear|worn edges/, ['wear', 'smart']],
  [/smart mat/, ['smart', 'material']],
  [/smart mask/, ['smart', 'mask']],
  [/low (performance|end)|too (slow|weak)|runs? (slow|bad)/, ['performance']],
  [/pen pressure|drawing tablet/, ['pressure']],
  [/both sides|other side/, ['symmetry']],
  [/(lost|lose) (my )?work|didn'?t save|not saved|closed (by )?accident/, ['recover', 'autosave']],
  [/high poly/, ['bake']],
  [/normal map/, ['bake', 'image']],
  [/what'?s new|new features?/, ['update']],
  [/who (made|owns|created)/, ['about']],
  [/getting started|how (does|do) (this|it|lmp) work|get started/, ['start']],
];

const STOP = new Set(('i me my mine you your it its it\'s a an the to of in on at for from with and or but so if is are am be was were do does did doing ' +
  'how what why when where which who can could would should will want wanna need like just make made makes get got go goes going ' +
  'this that these those there here some any thing things way ways there\'s please help lmp im i\'m into out up down by as than then ' +
  'also really very much more most maybe idk let lets use using used one').split(' '));

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '\'').replace(/[^a-z0-9_'+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
function stem(w: string) {
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ly')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
/** How well a typed word matches a known word: 1 exact, less for prefixes and typos, 0 none. */
function wordMatch(q: string, w: string): number {
  if (q === w) return 1;
  const sq = stem(q), sw = stem(w);
  if (sq === sw) return 0.95;
  if (sq.length >= 3 && sw.startsWith(sq)) return 0.7;          // still typing
  if (sq.length >= 5 && sw.length >= 5 && (sw.includes(sq) || sq.includes(sw))) return 0.6;
  if (sq.length >= 4 && sq.length === sw.length) {
    const d = [...sq].reduce<number[]>((a, c, i) => (c !== sw[i] ? [...a, i] : a), []);
    if (d.length === 2 && d[1] === d[0] + 1 && sq[d[0]] === sw[d[1]] && sq[d[1]] === sw[d[0]]) return 0.8; // swapped letters
  }
  const max = sq.length >= 7 ? 2 : sq.length >= 4 ? 1 : 0;
  if (max && lev(sq, sw, max) <= max) return 0.75;              // typo
  return 0;
}

interface Indexed { g: Guide; title: string[]; tags: Set<string>; words: string[]; body: string[] }
let INDEX: Indexed[] | null = null;
const SYN_WORDS: [string, string][] = Object.entries(SYN).flatMap(([c, ws]) => ws.map((w) => [w, c] as [string, string]));
function tokens(s: string) { return norm(s.replace(/\*\*/g, '')).split(' ').filter((w) => w && !STOP.has(w)); }
function index(): Indexed[] {
  return (INDEX ??= GUIDES.map((g) => ({
    g, title: tokens(g.title + ' ' + g.sum), tags: new Set(g.tags), words: tokens(g.words ?? ''),
    body: tokens(g.body.map((b) => [b.h, b.p, ...(b.steps ?? []), ...(b.tips ?? []), ...(b.table ?? []).flat()].filter(Boolean).join(' ')).join(' ')),
  })));
}
/** Concepts a word stands for (with match strength). */
function concepts(w: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const [sw, c] of SYN_WORDS) {
    const m = wordMatch(w, sw);
    if (m > (out.get(c) ?? 0)) out.set(c, m);
  }
  return out;
}
const best = (q: string, list: string[]) => list.reduce((m, w) => Math.max(m, wordMatch(q, w)), 0);

export interface GuideHit { g: Guide; score: number }
/** Rank guides for a question typed in everyday words. */
export function searchGuides(query: string, limit = 8): GuideHit[] {
  const q = norm(query);
  if (!q) return [];
  const words = tokens(q);
  const phraseTags = new Set<string>();
  for (const [re, tags] of PHRASES) if (re.test(q)) tags.forEach((t) => phraseTags.add(t));
  const wordConcepts = words.map(concepts);
  const hits: GuideHit[] = [];
  for (const ix of index()) {
    let score = 0;
    for (const t of phraseTags) if (ix.tags.has(t)) score += 5;
    words.forEach((w, i) => {
      let s = 0;
      for (const [c, m] of wordConcepts[i]) if (ix.tags.has(c)) s = Math.max(s, 3 * m);
      s = Math.max(s, 3.5 * best(w, ix.title), 2.5 * best(w, ix.words), 1 * best(w, ix.body));
      score += s;
    });
    // Answers that cover more of the question beat ones that match one word very well.
    const covered = words.filter((w, i) => [...wordConcepts[i].keys()].some((c) => ix.tags.has(c)) || best(w, ix.title) || best(w, ix.words) > 0.6).length;
    if (words.length > 1) score *= 0.6 + 0.4 * (covered / words.length);
    // "What's new" mentions everything; only rank it high when asked about updates.
    if (ix.g.id === 'whats-new' && !words.some((_, i) => wordConcepts[i].has('update'))) score *= 0.5;
    if (score > 1.2) hits.push({ g: ix.g, score });
  }
  hits.sort((a, b) => b.score - a.score);
  // Keep the clear answers: drop results far below the best one.
  const top = hits[0]?.score ?? 0;
  return hits.filter((h) => h.score >= top * 0.3).slice(0, limit);
}

export const guideById = (id: string) => GUIDES.find((g) => g.id === id);

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
/** **bold** → <b>, keys like Ctrl+S / F1 → <kbd>. */
export function fmt(s: string): string {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

// ====================================================================== walkthrough tours

/**
 * One step of a "Walk me through it" tour. The pointer goes to `at` (a CSS selector; `has` picks the
 * match whose text contains it) and the bubble under it says `t`. `wait` says when the step is done:
 * 'next' (the Next button), 'click' / 'rclick' on the target, 'key:Escape', or 'state:<name>' (the app checks).
 * `act` runs first (same actions as the "Show me" buttons).
 */
export interface TourStep { t: string; at?: string; has?: string; wait?: string; act?: string; /** Skip the step when this state is already true. */ skip?: string }

export const TOURS: Record<string, TourStep[]> = {
  'getting-started': [
    { at: '#shelf', t: 'This is the Assets shelf: models, smart materials, materials, brushes and more. Drag things from here onto the model.' },
    { at: '#viewport > canvas', t: 'Your model. Right mouse drag to turn it, middle mouse to move, wheel to zoom. Paint with the left mouse button.' },
    { at: '#toolstrip', t: 'Your tools: brush, eraser, polygon fill, path, picker, the mask button and History.' },
    { at: '#toolbar', t: 'Settings for the tool you have, like brush size, flow and smoothing.' },
    { at: '#right', t: 'Layers on top, and Properties below for whatever you selected.' },
    { at: '#mode-tabs', t: 'Switch to Baking before using smart materials, and Material Designer to make your own materials.' },
    { at: '#guide-btn', t: 'Stuck? Press F1 or click Guide and type your question.' },
  ],
  'paint-basics': [
    { at: '#toolstrip button[title^="Paint"]', t: 'Click the brush (or press B).', wait: 'click' },
    { at: '#right .layer', has: 'Layer', t: 'Make sure a paint layer is selected. Click it.', wait: 'click' },
    { at: '#right .group', has: 'Material', t: 'Here you choose what the brush paints: colour, roughness, metal and more.' },
    { at: '#viewport > canvas', t: 'Now paint on the model with the left mouse button.', wait: 'state:stroke' },
    { at: '#toolbar .tb-scroll', t: 'Change size, flow and hardness here. [ and ] change the size too.' },
  ],
  'lazy-mouse': [
    { act: 'tool:paint', at: '#toolbar .inline-slider', has: 'Smoothing', t: 'Turn up Smoothing. Around 30 is a good start.', wait: 'state:smoothing' },
    { at: '#viewport > canvas', t: 'Paint a line. The dotted string pulls the brush along behind your mouse, so it comes out steady.', wait: 'state:stroke' },
    { at: '#toolbar .inline-slider', has: 'Smoothing', t: 'Set it back to off when you want normal painting.' },
  ],
  'path-tool': [
    { at: '#toolstrip button[title^="Path"]', t: 'Click the Path tool (or press L).', wait: 'click' },
    { at: '#viewport > canvas', t: 'Click on the model to add points. Click and drag to bend the curve.', wait: 'state:path2' },
    { at: '#viewport > canvas', t: 'The brush follows the curve while you edit. Drag points to change it.' },
    { at: '#toolbar button.primary', has: 'Finish', t: 'Click Finish (or press Enter) to keep it.', wait: 'state:pathdone' },
  ],
  'symmetry': [
    { act: 'tool:paint', at: '#toolbar .sym-wrap', t: 'Click X to mirror left and right.', wait: 'state:sym' },
    { at: '#viewport > canvas', t: 'The red line is the mirror. Paint on one side and the other side gets it too.', wait: 'state:stroke' },
  ],
  'history': [
    { at: '#toolstrip button[title^="History"]', t: 'Click History (or press H).', wait: 'state:history' },
    { at: '#shelf .hist-row', t: 'Your recent changes, newest at the top. Click one to go back to it.' },
    { at: '#shelf .hist-row.original', t: '"Original" is how the file was before all of these.' },
    { at: '#shelf .hist-row', t: 'Went back too far? Click the top row to get your latest version back.' },
  ],
  'masks': [
    { at: '#right .layer', t: 'Right click the layer you want to hide in places.', wait: 'rclick' },
    { at: '#ctx-menu button', has: 'Add black mask', t: 'Choose Add black mask. The layer disappears for now.', wait: 'state:masktarget' },
    { at: '#viewport > canvas', t: 'Paint white where you want the layer to show.', wait: 'state:stroke' },
    { at: '#toolstrip', t: 'Press M (or the mask button) to switch between painting the mask and the layer.' },
  ],
  'shapes': [
    { at: '#right .layer', t: 'Right click the layer you want to put a shape on.', wait: 'rclick' },
    { at: '#ctx-menu button', has: 'Shape (circle', t: 'Under Add generator, choose Shape (circle, star…).', wait: 'state:shape' },
    { at: '#viewport > canvas', t: 'Drag on the model to move the shape where you want it.', wait: 'state:shapemoved' },
    { at: '#right .row', has: 'Shape', t: 'Pick a different shape here. Size, stretch and rotation are just below.' },
    { at: '#toolbar button.primary', has: 'Done', t: 'Click Done (or press Esc) when it\'s in place.', wait: 'state:shapedone' },
  ],
  'smart-materials': [
    { at: '#mode-tabs button', has: 'Baking', t: 'First bake the mesh maps, so the wear lands on the edges. Click Baking.', wait: 'state:bakemode', skip: 'baked' },
    { at: 'button.primary.big', has: 'Bake selected', t: 'Click Bake selected textures and wait for it to finish.', wait: 'state:baked', skip: 'baked' },
    { at: '#mode-tabs button', has: 'Painting', t: 'Go back to Painting.', wait: 'state:paintmode', skip: 'paintmode' },
    { act: 'shelf:smart', at: '.shelf-sec', has: 'Smart materials', t: 'Here are the smart materials.' },
    { at: '#shelf .tile', t: 'Drag one onto the model (or click it).', wait: 'state:morelayers' },
    { at: '#right', t: 'It came in as a folder of layers. Open it to change the colours or the masks.' },
  ],
  'baking': [
    { at: '#mode-tabs button', has: 'Baking', t: 'Click Baking.', wait: 'state:bakemode' },
    { at: '#shelf', t: 'Tick the maps you want. Leaving them all on is fine.' },
    { at: 'button.primary.big', has: 'Bake selected', t: 'Click Bake selected textures.', wait: 'state:baking' },
    { at: '#status-bake', t: 'Progress shows here at the bottom. Wait for the tick marks.', wait: 'state:baked' },
    { at: '#mode-tabs button', has: 'Painting', t: 'Done. Go back to Painting.', wait: 'state:paintmode' },
  ],
  'export': [
    { at: '#sidestrip button[title^="Export"]', t: 'Click Export (or press Ctrl+Shift+E).', wait: 'state:export' },
    { at: '#export-dialog select', t: 'Pick where the textures are going: Roblox, Blender/Unity or Unreal.' },
    { at: '#export-dialog footer button.primary', t: 'Click Export to folder and choose a folder.', wait: 'click' },
  ],
  'roblox': [
    { at: '#sidestrip button[title^="Export"]', t: 'Click Export (or press Ctrl+Shift+E).', wait: 'state:export' },
    { at: '#export-dialog select', t: 'Choose Roblox SurfaceAppearance. LMP keeps the size at 1024 for Roblox.' },
    { at: '#export-dialog footer button.primary', t: 'Click Export to folder. In Roblox Studio, put a SurfaceAppearance in your MeshPart and set its maps to these files.', wait: 'click' },
  ],
  'import-images': [
    { at: '#viewport', t: 'Drag your PNG or JPG files onto LMP now, or press Ctrl+I.', wait: 'state:import' },
    { at: '.imp-list', t: 'For each picture choose what it is: Color, Normal, Height and so on.' },
    { at: '.lmp-modal-foot button.primary', t: 'Choose where it goes, then click to add it.', wait: 'click' },
  ],
  'uv-overlap': [
    { at: '#toolbar button[title^="UV overlaps"]', t: 'Click this button (or press O).', wait: 'state:overlap' },
    { at: '#viewport > canvas', t: 'Dark spots are faces whose UVs overlap. Fix those in Blender, then reopen the model.' },
  ],
  'updates': [
    { at: '.menu-btn', has: 'File', t: 'Open the File menu.', wait: 'state:menu' },
    { at: '.menu.open button', has: 'Check for updates', t: 'Click Check for updates.', wait: 'click' },
  ],
};
