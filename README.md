<p align="center">
  <img src="source/icons/lmp-256.png" alt="LMP logo" width="128">
</p>

<h1 align="center">LMP — Leo's Material Painter</h1>

<p align="center">Owned by <a href="https://github.com/LeoDevRX">LeoDevRX</a></p>

LMP is a free program for painting textures on 3D models. Open a model, paint on it with layers, masks and smart materials, then export the textures for Roblox, Unreal, Unity or Blender.

It's a free alternative to paid material painting programs, for anyone who would rather not pay for a subscription or deal with licence restrictions. The controls are kept familiar, so if you've used Substance Painter, most things work the same way.

I built LMP with help from Claude Opus 5.5, an AI model by Anthropic, to make my creative workflow easier.

**What it can do**
- Paint colour, roughness, metal, height and glow in one stroke, with brushes, layers, folders and masks
- Smart materials and smart masks (edge wear, dirt, rust) that follow your model's shape
- 114 free scanned materials, plus Substance .sbsar materials with all their settings
- Bake normal, AO, curvature and other mesh maps, including from a high poly model
- A built-in Guide that walks you through each tool

## Download

**[Download the latest version](https://github.com/LeoDevRX/LMP/releases/latest)** (Windows 10/11, 64-bit)

- **New install:** download `LMP-vX.XX.zip`, extract it anywhere (for example `D:\LMP`) and open `LMP.exe`. Nothing needs installing.
- **Already have LMP:** click **Update** in LMP when it tells you there's a new version. You can also download the small `LMP-vX.XX-update.zip`, extract it into the folder that holds your LMP folder and replace files when Windows asks.

## Is it safe?

Yes. LMP has no viruses, no ads, no hidden extra programs and no tracking.

- **It only connects to GitHub**, to check for a new version (and download it when you click Update) and to download a scanned material the first time you use it.
- **It doesn't send anything about you**, your files or your projects anywhere. Your work stays on your PC.
- **Nothing gets installed.** Extract the zip and run `LMP.exe`. To remove LMP, delete the folder.
- **It's built from the code in this repo** by GitHub's own servers, so what you download matches what you see here.

The parts LMP is built with are free building blocks inside it, not separate programs: Electron (the window it runs in, also used by Discord and VS Code), three.js (the 3D view), 7-Zip (to open .sbsar files), and free CC0 textures and lighting from ambientCG and Poly Haven. None of them run in the background or go online on their own.

Windows may say "Windows protected your PC" the first time you open it. That's because LMP isn't code-signed (a signing certificate costs money every year), not because anything is wrong. Click **More info → Run anyway**. You can also check the zip yourself at [virustotal.com](https://www.virustotal.com), which scans it with about 70 antivirus programs.

## Notes

LMP is an independent project. It isn't made by, affiliated with or endorsed by Adobe. Substance, Substance 3D Painter and Substance 3D Designer are trademarks of Adobe; they're mentioned only to say which files LMP can open.

LMP doesn't include any Adobe software or Substance materials. If you open your own .sbsar files and have Substance 3D Designer installed, LMP uses the copy of Adobe's renderer that's already on your PC.

The scanned materials (ambientCG) and HDR environments (Poly Haven) are CC0. Other open-source parts and their licenses are listed in the `licenses` folder.

