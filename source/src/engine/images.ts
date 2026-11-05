import * as THREE from 'three';

/** Load PNG/JPG bytes as a tiling texture with raw (unconverted) values. */
export async function imageTexture(bytes: ArrayBuffer, name: string): Promise<THREE.Texture> {
  const bmp = await createImageBitmap(new Blob([bytes]), {
    imageOrientation: 'flipY', // image top row = UV v=1, matching our UV convention
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  } as ImageBitmapOptions);
  const tex = new THREE.Texture(bmp as any);
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.name = name;
  tex.needsUpdate = true;
  return tex;
}
