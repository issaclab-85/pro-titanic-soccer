import * as THREE from 'three';
import type { AvatarConfig, ClubConfig, FieldSize, GraphicsQuality } from '../types/game';
import {
  createAdBoardTexture,
  createContactShadowTexture,
  createFootballTexture,
  createGoalNetTexture,
  createJerseyTexture,
  createPitchTexture,
  getSharedFabricBumpTexture,
  getSharedFaceTexture,
  getSharedSkinBumpTexture,
} from './textures';

export interface PlayerRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  torso: THREE.Mesh;
  headGroup: THREE.Group;
  dynamicHairGroup: THREE.Group | null;
  hairHasPhysics: boolean;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  activeRing: THREE.Mesh;
  staminaArc: THREE.Mesh;
  staminaMat: THREE.MeshBasicMaterial;
  contactShadow: THREE.Mesh;
  nameSprite: THREE.Sprite | null;
  disposables: { dispose: () => void }[];
}

function createSculptedTorsoGeometry(): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(0.49, 0.56, 0.27, 6, 8, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);

    // Normalized height ny in [-1..1]
    const ny = y / 0.28;

    // Athletic V-taper: broad shoulders at top, slim waist at bottom
    const widthFactor =
      ny >= 0 ? 0.96 + ny * 0.12 : 0.96 + ny * 0.17; // top ~1.08, waist ~0.79
    const depthFactor =
      ny >= 0 ? 0.98 + ny * 0.06 : 0.98 + ny * 0.13; // top ~1.04, waist ~0.85

    x *= widthFactor;
    z *= depthFactor;

    // Sculpted pectoral fullness on front chest (+Z) and slight shoulder rounding
    if (ny > 0.05 && ny < 0.85 && z > 0.02) {
      const chestBell = Math.sin(((ny - 0.05) / 0.8) * Math.PI);
      const centerWeight = Math.max(0, 1 - Math.abs(x) / 0.28);
      z += chestBell * centerWeight * 0.024;
    }

    // Slight upper shoulder slope rounding at outer collarbones
    if (ny > 0.72) {
      const edgeT = Math.min(1, Math.abs(x) / 0.25);
      pos.setY(i, y - edgeT * edgeT * 0.028);
    }

    pos.setX(i, x);
    pos.setZ(i, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function createSculptedPelvisGeometry(): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(0.41, 0.21, 0.245, 4, 3, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = y / 0.105; // -1..1
    const flare = ny < 0 ? 1.05 : 0.94;
    pos.setX(i, x * flare);
    pos.setZ(i, z * (ny < 0 ? 1.03 : 0.95));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function createNameLabelSprite(
  label: string,
  accentHex: string,
  maxAnisotropy: number,
): { sprite: THREE.Sprite; texture: THREE.CanvasTexture; material: THREE.SpriteMaterial } {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 128);

  // Clean chamfered dark badge
  ctx.fillStyle = 'rgba(9, 14, 26, 0.86)';
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(44, 24, 424, 72, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '800 34px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase().slice(0, 16), 256, 61);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.65, 0.42, 1);
  sprite.position.set(0, 2.42, 0);

  return { sprite, texture, material };
}

export function createPlayerRig(options: {
  club: ClubConfig;
  useAwayKit: boolean;
  isGoalkeeper: boolean;
  jerseyText: string;
  jerseyNumber: number;
  avatar: AvatarConfig;
  floatingName?: string;
  maxAnisotropy: number;
  shadowTexture: THREE.Texture;
}): PlayerRig {
  const {
    club,
    useAwayKit,
    isGoalkeeper,
    jerseyText,
    jerseyNumber,
    avatar,
    floatingName,
    maxAnisotropy,
    shadowTexture,
  } = options;

  const disposables: { dispose: () => void }[] = [];
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const kitPrimary = isGoalkeeper
    ? club.gkColor
    : useAwayKit
      ? club.awayPrimary
      : club.primaryColor;
  const shortsColor = isGoalkeeper ? '#0F172A' : useAwayKit ? club.awaySecondary : club.shortsColor;
  const socksColor = isGoalkeeper ? club.gkColor : useAwayKit ? club.awayPrimary : club.socksColor;

  // Procedural Front & Back Jersey Textures (back custom text stays consistent regardless of kit color)
  const fullJerseyTex = createJerseyTexture(
    club,
    useAwayKit,
    isGoalkeeper,
    jerseyText,
    jerseyNumber,
    maxAnisotropy,
  );
  const frontTex = fullJerseyTex;
  frontTex.repeat.set(0.5, 1);
  frontTex.offset.set(0, 0);

  const backTex = fullJerseyTex.clone();
  backTex.colorSpace = THREE.SRGBColorSpace;
  backTex.repeat.set(0.5, 1);
  backTex.offset.set(0.5, 0);
  backTex.needsUpdate = true;

  disposables.push(frontTex, backTex);

  // Shared cached bump & facial textures (kept alive across rigs — NOT pushed to per-rig disposables)
  const fabricBumpTex = getSharedFabricBumpTexture(maxAnisotropy);
  const skinBumpTex = getSharedSkinBumpTexture();
  const faceTex = getSharedFaceTexture(avatar.skinTone, avatar.hairColor, maxAnisotropy);

  const skinSheenColor = new THREE.Color(avatar.skinTone).lerp(new THREE.Color('#FF9B76'), 0.32);

  // Materials with realistic fabric weave, sheen, and non-plastic dermal response
  const fabricMat = new THREE.MeshPhysicalMaterial({
    color: kitPrimary,
    bumpMap: fabricBumpTex,
    bumpScale: 0.011,
    roughness: 0.78,
    metalness: 0.03,
    sheen: 0.34,
    sheenRoughness: 0.72,
    sheenColor: new THREE.Color('#E2E8F0'),
  });
  const frontTorsoMat = new THREE.MeshPhysicalMaterial({
    map: frontTex,
    bumpMap: fabricBumpTex,
    bumpScale: 0.011,
    roughness: 0.76,
    metalness: 0.03,
    sheen: 0.32,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color('#E2E8F0'),
  });
  const backTorsoMat = new THREE.MeshPhysicalMaterial({
    map: backTex,
    bumpMap: fabricBumpTex,
    bumpScale: 0.011,
    roughness: 0.76,
    metalness: 0.03,
    sheen: 0.32,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color('#E2E8F0'),
  });
  const shortsMat = new THREE.MeshPhysicalMaterial({
    color: shortsColor,
    bumpMap: fabricBumpTex,
    bumpScale: 0.009,
    roughness: 0.74,
    metalness: 0.04,
    sheen: 0.25,
    sheenRoughness: 0.75,
  });
  const socksMat = new THREE.MeshStandardMaterial({
    color: socksColor,
    bumpMap: fabricBumpTex,
    bumpScale: 0.01,
    roughness: 0.82,
    metalness: 0.02,
  });
  const sockTrimMat = new THREE.MeshStandardMaterial({
    color: club.accentColor,
    roughness: 0.72,
    metalness: 0.05,
  });
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: avatar.skinTone,
    bumpMap: skinBumpTex,
    bumpScale: 0.0035,
    roughness: 0.56,
    metalness: 0.01,
    sheen: 0.26,
    sheenRoughness: 0.68,
    sheenColor: skinSheenColor,
  });
  const headFaceMat = new THREE.MeshPhysicalMaterial({
    map: faceTex,
    bumpMap: skinBumpTex,
    bumpScale: 0.003,
    roughness: 0.54,
    metalness: 0.01,
    sheen: 0.28,
    sheenRoughness: 0.66,
    sheenColor: skinSheenColor,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: avatar.hairColor,
    roughness: 0.78,
    metalness: 0.06,
  });
  const headbandMat = new THREE.MeshStandardMaterial({
    color: club.accentColor,
    roughness: 0.65,
    metalness: 0.08,
  });
  const bootMat = new THREE.MeshPhysicalMaterial({
    color: avatar.bootColor,
    roughness: 0.26,
    metalness: 0.22,
    clearcoat: 0.45,
    clearcoatRoughness: 0.28,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: '#F8FAFC',
    roughness: 0.38,
    metalness: 0.08,
  });

  disposables.push(
    fabricMat,
    frontTorsoMat,
    backTorsoMat,
    shortsMat,
    socksMat,
    sockTrimMat,
    skinMat,
    headFaceMat,
    hairMat,
    headbandMat,
    bootMat,
    gloveMat,
  );

  // 1. Contact Shadow (grounded at y = 0.015)
  const shadowGeo = new THREE.PlaneGeometry(1.08, 1.08);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.015;
  root.add(contactShadow);
  disposables.push(shadowGeo, shadowMat);

  // 2. Active Controlled Player Ring & Sleek Stamina Arc
  const ringGeo = new THREE.RingGeometry(0.54, 0.68, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#FACC15',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const activeRing = new THREE.Mesh(ringGeo, ringMat);
  activeRing.rotation.x = -Math.PI / 2;
  activeRing.position.y = 0.025;
  activeRing.visible = false;
  root.add(activeRing);

  const staminaGeo = new THREE.RingGeometry(0.75, 0.87, 32, 1);
  const staminaMat = new THREE.MeshBasicMaterial({
    color: '#34D399',
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
  });
  const staminaArc = new THREE.Mesh(staminaGeo, staminaMat);
  staminaArc.rotation.x = -Math.PI / 2;
  staminaArc.rotation.z = Math.PI / 2;
  staminaArc.position.y = 0.027;
  staminaArc.visible = false;
  root.add(staminaArc);
  disposables.push(ringGeo, ringMat, staminaGeo, staminaMat);

  // 3. Sculpted V-Taper Athletic Torso (index 4 = +Z Front, index 5 = -Z Back)
  const torsoGeo = createSculptedTorsoGeometry();
  const torso = new THREE.Mesh(torsoGeo, [
    fabricMat,
    fabricMat,
    fabricMat,
    fabricMat,
    frontTorsoMat,
    backTorsoMat,
  ]);
  torso.position.y = 1.16;
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyGroup.add(torso);
  disposables.push(torsoGeo);

  // 4. Sculpted Collar Trim
  const collarGeo = new THREE.TorusGeometry(0.105, 0.025, 8, 22);
  const collar = new THREE.Mesh(collarGeo, shortsMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 1.44;
  bodyGroup.add(collar);
  disposables.push(collarGeo);

  // 5. Tapered Athletic Pelvis / Shorts Waist
  const pelvisGeo = createSculptedPelvisGeometry();
  const pelvis = new THREE.Mesh(pelvisGeo, shortsMat);
  pelvis.position.y = 0.825;
  pelvis.castShadow = true;
  bodyGroup.add(pelvis);
  disposables.push(pelvisGeo);

  // 6. Sculpted Head, Facial Features, Ears & Diverse Hairstyles
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.46, 0);
  bodyGroup.add(headGroup);

  const neckGeo = new THREE.CylinderGeometry(0.062, 0.078, 0.14, 14);
  const neck = new THREE.Mesh(neckGeo, skinMat);
  neck.position.y = 0.045;
  headGroup.add(neck);

  // Rotate cranium -PI/2 around Y so UV center u=0.5 aligns cleanly on +Z front face
  const headGeo = new THREE.SphereGeometry(0.158, 24, 18);
  headGeo.rotateY(-Math.PI / 2);
  const head = new THREE.Mesh(headGeo, headFaceMat);
  head.scale.set(0.91, 1.07, 0.98);
  head.position.y = 0.23;
  head.castShadow = true;
  headGroup.add(head);

  // Subtle 3D Nose Bridge & Ears for authentic profile silhouette
  const noseGeo = new THREE.ConeGeometry(0.021, 0.056, 8);
  const nose = new THREE.Mesh(noseGeo, skinMat);
  nose.rotation.x = Math.PI * 0.44;
  nose.position.set(0, 0.222, 0.148);
  headGroup.add(nose);

  const earGeo = new THREE.SphereGeometry(0.032, 10, 8);
  earGeo.scale(0.46, 1.05, 0.72);
  const leftEar = new THREE.Mesh(earGeo, skinMat);
  leftEar.position.set(-0.142, 0.222, -0.012);
  const rightEar = new THREE.Mesh(earGeo, skinMat);
  rightEar.position.set(0.142, 0.222, -0.012);
  headGroup.add(leftEar, rightEar);
  disposables.push(neckGeo, headGeo, noseGeo, earGeo);

  // Hairstyle Builder + Physics Group
  const dynamicHairGroup = new THREE.Group();
  dynamicHairGroup.position.set(0, 0.245, -0.01);
  headGroup.add(dynamicHairGroup);

  let hairHasPhysics = false;
  const style = avatar.hairStyle;

  if (style === 'buzz') {
    const buzzGeo = new THREE.SphereGeometry(0.163, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56);
    const buzz = new THREE.Mesh(buzzGeo, hairMat);
    buzz.scale.set(0.91, 1.04, 0.98);
    buzz.position.set(0, 0.236, -0.01);
    buzz.castShadow = true;
    headGroup.add(buzz);
    disposables.push(buzzGeo);
  } else if (style === 'crop') {
    const crownGeo = new THREE.SphereGeometry(0.168, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.54);
    const crown = new THREE.Mesh(crownGeo, hairMat);
    crown.scale.set(0.93, 1.05, 1.0);
    crown.position.set(0, 0.242, -0.012);
    crown.castShadow = true;
    headGroup.add(crown);

    // Textured forward fringe across brow
    const fringeGeo = new THREE.BoxGeometry(0.24, 0.058, 0.16);
    const fringe = new THREE.Mesh(fringeGeo, hairMat);
    fringe.position.set(0, 0.34, 0.072);
    fringe.rotation.x = 0.18;
    fringe.castShadow = true;
    headGroup.add(fringe);
    disposables.push(crownGeo, fringeGeo);
  } else if (style === 'curl') {
    hairHasPhysics = true;
    const baseCurlGeo = new THREE.SphereGeometry(0.166, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const baseCurl = new THREE.Mesh(baseCurlGeo, hairMat);
    baseCurl.scale.set(0.93, 1.04, 0.99);
    baseCurl.position.set(0, 0.238, -0.012);
    headGroup.add(baseCurl);

    const puffGeo = new THREE.SphereGeometry(0.056, 10, 8);
    const curlOffsets: [number, number, number, number][] = [
      [0, 0.155, 0.06, 1.15],
      [-0.075, 0.145, 0.045, 1.0],
      [0.075, 0.145, 0.045, 1.0],
      [-0.105, 0.11, -0.02, 0.95],
      [0.105, 0.11, -0.02, 0.95],
      [0, 0.16, -0.03, 1.18],
      [-0.065, 0.125, -0.095, 1.0],
      [0.065, 0.125, -0.095, 1.0],
      [0, 0.085, -0.13, 0.92],
    ];
    for (const [cx, cy, cz, sc] of curlOffsets) {
      const puff = new THREE.Mesh(puffGeo, hairMat);
      puff.position.set(cx, cy, cz);
      puff.scale.setScalar(sc);
      puff.castShadow = true;
      dynamicHairGroup.add(puff);
    }
    disposables.push(baseCurlGeo, puffGeo);
  } else if (style === 'braids') {
    hairHasPhysics = true;
    // Braided crown rows
    const rowGeo = new THREE.CapsuleGeometry(0.024, 0.16, 4, 8);
    rowGeo.rotateX(Math.PI / 2);
    for (let r = -2; r <= 2; r++) {
      const row = new THREE.Mesh(rowGeo, hairMat);
      row.position.set(r * 0.044, 0.37 - Math.abs(r) * 0.012, -0.01);
      row.castShadow = true;
      headGroup.add(row);
    }

    // Hanging braided locs inside dynamicHairGroup
    const locGeo = new THREE.CylinderGeometry(0.02, 0.014, 0.24, 7);
    const beadGeo = new THREE.SphereGeometry(0.017, 6, 6);
    const locAngles = [-0.85, -0.55, -0.27, 0, 0.27, 0.55, 0.85];
    for (let i = 0; i < locAngles.length; i++) {
      const ang = locAngles[i];
      const lx = Math.sin(ang) * 0.125;
      const lz = -Math.cos(ang) * 0.135 - 0.02;
      const loc = new THREE.Mesh(locGeo, hairMat);
      loc.position.set(lx, -0.03, lz);
      loc.rotation.x = 0.22;
      loc.rotation.z = -ang * 0.14;
      loc.castShadow = true;
      dynamicHairGroup.add(loc);

      if (i % 2 === 0) {
        const bead = new THREE.Mesh(beadGeo, headbandMat);
        bead.position.set(lx * 1.04, -0.135, lz - 0.022);
        dynamicHairGroup.add(bead);
      }
    }
    disposables.push(rowGeo, locGeo, beadGeo);
  } else if (style === 'sweep') {
    hairHasPhysics = true;
    const sweepCapGeo = new THREE.SphereGeometry(0.168, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const sweepCap = new THREE.Mesh(sweepCapGeo, hairMat);
    sweepCap.scale.set(0.94, 1.05, 1.0);
    sweepCap.position.set(0, 0.242, -0.012);
    headGroup.add(sweepCap);

    // Swept-back crest + flowing layered locks
    const crestGeo = new THREE.BoxGeometry(0.24, 0.11, 0.28);
    const crest = new THREE.Mesh(crestGeo, hairMat);
    crest.position.set(0.01, 0.135, -0.025);
    crest.rotation.x = -0.18;
    crest.rotation.z = -0.06;
    crest.castShadow = true;
    dynamicHairGroup.add(crest);

    const tailGeo = new THREE.BoxGeometry(0.22, 0.16, 0.09);
    const tail = new THREE.Mesh(tailGeo, hairMat);
    tail.position.set(0, 0.02, -0.155);
    tail.rotation.x = 0.24;
    tail.castShadow = true;
    dynamicHairGroup.add(tail);
    disposables.push(sweepCapGeo, crestGeo, tailGeo);
  } else if (style === 'headband') {
    hairHasPhysics = true;
    const baseHairGeo = new THREE.SphereGeometry(0.168, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.54);
    const baseHair = new THREE.Mesh(baseHairGeo, hairMat);
    baseHair.scale.set(0.94, 1.05, 1.0);
    baseHair.position.set(0, 0.242, -0.012);
    headGroup.add(baseHair);

    // Athletic forehead headband
    const bandGeo = new THREE.TorusGeometry(0.154, 0.022, 8, 28);
    const band = new THREE.Mesh(bandGeo, headbandMat);
    band.rotation.x = Math.PI / 2 - 0.16;
    band.scale.set(0.95, 1.02, 1.0);
    band.position.set(0, 0.295, -0.005);
    headGroup.add(band);

    // Flowing top locks & trailing headband tie inside dynamicHairGroup
    const flowTopGeo = new THREE.SphereGeometry(0.135, 14, 10);
    flowTopGeo.scale(1.12, 0.72, 1.25);
    const flowTop = new THREE.Mesh(flowTopGeo, hairMat);
    flowTop.position.set(0, 0.135, -0.035);
    flowTop.castShadow = true;
    dynamicHairGroup.add(flowTop);

    const backTailGeo = new THREE.CylinderGeometry(0.052, 0.026, 0.22, 8);
    const backTail = new THREE.Mesh(backTailGeo, hairMat);
    backTail.position.set(0, -0.01, -0.17);
    backTail.rotation.x = 0.34;
    backTail.castShadow = true;
    dynamicHairGroup.add(backTail);

    const ribbonGeo = new THREE.BoxGeometry(0.024, 0.14, 0.01);
    const ribbonL = new THREE.Mesh(ribbonGeo, headbandMat);
    ribbonL.position.set(-0.022, -0.015, -0.175);
    ribbonL.rotation.set(0.32, 0, 0.18);
    const ribbonR = new THREE.Mesh(ribbonGeo, headbandMat);
    ribbonR.position.set(0.022, -0.015, -0.175);
    ribbonR.rotation.set(0.32, 0, -0.18);
    dynamicHairGroup.add(ribbonL, ribbonR);

    disposables.push(baseHairGeo, bandGeo, flowTopGeo, backTailGeo, ribbonGeo);
  } else {
    // 'fade' (default & fallback): crisp tapered sides + athletic textured top
    const fadeSideGeo = new THREE.SphereGeometry(0.162, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const fadeSide = new THREE.Mesh(fadeSideGeo, hairMat);
    fadeSide.scale.set(0.91, 1.04, 0.98);
    fadeSide.position.set(0, 0.236, -0.01);
    headGroup.add(fadeSide);

    const fadeTopGeo = new THREE.BoxGeometry(0.21, 0.088, 0.23);
    const fadeTop = new THREE.Mesh(fadeTopGeo, hairMat);
    fadeTop.position.set(0, 0.372, 0.015);
    fadeTop.rotation.x = -0.08;
    fadeTop.castShadow = true;
    headGroup.add(fadeTop);
    disposables.push(fadeSideGeo, fadeTopGeo);
  }

  // 7. Muscular Articulated Arms (Pivot at shoulder y = 1.38)
  const deltoidGeo = new THREE.SphereGeometry(0.076, 12, 10);
  const sleeveGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.058, -0.22),
      new THREE.Vector2(0.066, -0.11),
      new THREE.Vector2(0.072, 0.0),
    ],
    12,
  );
  const forearmGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.038, -0.30),
      new THREE.Vector2(0.052, -0.17),
      new THREE.Vector2(0.049, -0.08),
      new THREE.Vector2(0.057, 0.0),
    ],
    12,
  );
  const handGeo = isGoalkeeper
    ? new THREE.BoxGeometry(0.105, 0.135, 0.078)
    : new THREE.SphereGeometry(0.048, 10, 10);
  if (!isGoalkeeper) {
    handGeo.scale(0.84, 1.24, 0.68);
  }
  disposables.push(deltoidGeo, sleeveGeo, forearmGeo, handGeo);

  const buildArm = (side: -1 | 1) => {
    const armGroup = new THREE.Group();
    armGroup.position.set(side * 0.305, 1.38, 0);

    const deltoid = new THREE.Mesh(deltoidGeo, fabricMat);
    deltoid.position.y = -0.02;
    deltoid.castShadow = true;
    armGroup.add(deltoid);

    const sleeve = new THREE.Mesh(sleeveGeo, fabricMat);
    sleeve.position.y = 0.0;
    sleeve.castShadow = true;
    armGroup.add(sleeve);

    const forearm = new THREE.Mesh(forearmGeo, isGoalkeeper ? fabricMat : skinMat);
    forearm.position.y = -0.21;
    forearm.castShadow = true;
    armGroup.add(forearm);

    const hand = new THREE.Mesh(handGeo, isGoalkeeper ? gloveMat : skinMat);
    hand.position.y = -0.535;
    hand.castShadow = true;
    armGroup.add(hand);

    bodyGroup.add(armGroup);
    return armGroup;
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // 8. Muscular Sculpted Legs & Football Boots (Pivot at hip y = 0.78, sole lands cleanly at y = 0)
  const thighGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.078, -0.25),
      new THREE.Vector2(0.092, -0.12),
      new THREE.Vector2(0.099, 0.0),
    ],
    14,
  );
  const kneeGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.062, -0.15),
      new THREE.Vector2(0.066, -0.07),
      new THREE.Vector2(0.072, 0.0),
    ],
    12,
  );
  const sockGeo = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.048, -0.30),
      new THREE.Vector2(0.055, -0.22),
      new THREE.Vector2(0.073, -0.11), // Sculpted gastrocnemius calf curve
      new THREE.Vector2(0.067, -0.02),
      new THREE.Vector2(0.069, 0.0),
    ],
    14,
  );
  const sockCuffGeo = new THREE.TorusGeometry(0.066, 0.011, 6, 16);
  const bootUpperGeo = new THREE.SphereGeometry(0.072, 14, 10);
  bootUpperGeo.scale(0.88, 0.68, 1.68);
  const bootAnkleGeo = new THREE.CylinderGeometry(0.051, 0.056, 0.065, 12);
  const bootStripeGeo = new THREE.BoxGeometry(0.132, 0.02, 0.09);
  const soleGeo = new THREE.BoxGeometry(0.128, 0.024, 0.242);
  const soleMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    roughness: 0.38,
    metalness: 0.62,
  });
  const bootAccentMat = new THREE.MeshStandardMaterial({
    color: '#F8FAFC',
    roughness: 0.35,
    metalness: 0.15,
  });
  disposables.push(
    thighGeo,
    kneeGeo,
    sockGeo,
    sockCuffGeo,
    bootUpperGeo,
    bootAnkleGeo,
    bootStripeGeo,
    soleGeo,
    soleMat,
    bootAccentMat,
  );

  const buildLeg = (side: -1 | 1) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(side * 0.128, 0.78, 0);

    const thigh = new THREE.Mesh(thighGeo, shortsMat);
    thigh.position.y = 0.0;
    thigh.castShadow = true;
    legGroup.add(thigh);

    const knee = new THREE.Mesh(kneeGeo, skinMat);
    knee.position.y = -0.245;
    knee.castShadow = true;
    legGroup.add(knee);

    const sock = new THREE.Mesh(sockGeo, socksMat);
    sock.position.y = -0.385;
    sock.castShadow = true;
    legGroup.add(sock);

    const cuff = new THREE.Mesh(sockCuffGeo, sockTrimMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.395;
    legGroup.add(cuff);

    const bootAnkle = new THREE.Mesh(bootAnkleGeo, bootMat);
    bootAnkle.position.set(0, -0.695, -0.01);
    bootAnkle.castShadow = true;
    legGroup.add(bootAnkle);

    const bootUpper = new THREE.Mesh(bootUpperGeo, bootMat);
    bootUpper.position.set(0, -0.728, 0.045);
    bootUpper.castShadow = true;
    legGroup.add(bootUpper);

    const bootStripe = new THREE.Mesh(bootStripeGeo, bootAccentMat);
    bootStripe.position.set(0, -0.725, 0.03);
    legGroup.add(bootStripe);

    const sole = new THREE.Mesh(soleGeo, soleMat);
    sole.position.set(0, -0.768, 0.042);
    legGroup.add(sole);

    bodyGroup.add(legGroup);
    return legGroup;
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  // 9. Optional Floating Nameplate
  let nameSprite: THREE.Sprite | null = null;
  if (floatingName) {
    const badge = createNameLabelSprite(floatingName, club.accentColor, maxAnisotropy);
    nameSprite = badge.sprite;
    root.add(nameSprite);
    disposables.push(badge.texture, badge.material);
  }

  return {
    root,
    bodyGroup,
    torso,
    headGroup,
    dynamicHairGroup,
    hairHasPhysics,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    activeRing,
    staminaArc,
    staminaMat,
    contactShadow,
    nameSprite,
    disposables,
  };
}

export function createFootballMesh(maxAnisotropy: number, shadowTexture: THREE.Texture) {
  const disposables: { dispose: () => void }[] = [];
  const group = new THREE.Group();

  const ballGeo = new THREE.SphereGeometry(0.24, 24, 24);
  const ballTex = createFootballTexture(maxAnisotropy);
  const ballMat = new THREE.MeshStandardMaterial({
    map: ballTex,
    roughness: 0.38,
    metalness: 0.06,
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.castShadow = true;
  ballMesh.receiveShadow = true;
  group.add(ballMesh);

  const shadowGeo = new THREE.PlaneGeometry(0.75, 0.75);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: 0.5,
  });
  const ballShadow = new THREE.Mesh(shadowGeo, shadowMat);
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = 0.015;

  disposables.push(ballGeo, ballTex, ballMat, shadowGeo, shadowMat);

  return { group, ballMesh, ballShadow, disposables };
}

export function createStadiumEnvironment(options: {
  fieldSize: FieldSize;
  width: number;
  length: number;
  homeClub: ClubConfig;
  awayClub: ClubConfig;
  maxAnisotropy: number;
  graphicsQuality?: GraphicsQuality;
}) {
  const {
    width,
    length,
    homeClub,
    awayClub,
    maxAnisotropy,
    graphicsQuality = 'medium',
  } = options;
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  // 1. Extended outer stadium track apron so terrain never ends as a floating void
  const apronGeo = new THREE.PlaneGeometry(260, 300);
  const apronMat = new THREE.MeshStandardMaterial({
    color: '#0D1F17',
    roughness: 0.94,
    metalness: 0.02,
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.03;
  apron.receiveShadow = true;
  group.add(apron);

  // Tartan stadium perimeter track around turf (widened buffer for dugouts, photographers, marshals)
  const trackGeo = new THREE.PlaneGeometry(width + 20, length + 20);
  const trackMat = new THREE.MeshStandardMaterial({
    color: '#1A2436',
    roughness: 0.88,
    metalness: 0.04,
  });
  const trackMesh = new THREE.Mesh(trackGeo, trackMat);
  trackMesh.rotation.x = -Math.PI / 2;
  trackMesh.position.y = -0.012;
  trackMesh.receiveShadow = true;
  group.add(trackMesh);
  disposables.push(apronGeo, apronMat, trackGeo, trackMat);

  // 2. Main Mowed Pitch with Chalk Lines
  const pitchMarginW = width * 1.12;
  const pitchMarginL = length * 1.09;
  const pitchGeo = new THREE.PlaneGeometry(pitchMarginW, pitchMarginL);
  const pitchTex = createPitchTexture(width, length, maxAnisotropy);
  const pitchMat = new THREE.MeshStandardMaterial({
    map: pitchTex,
    roughness: 0.86,
    metalness: 0.02,
  });
  const pitchMesh = new THREE.Mesh(pitchGeo, pitchMat);
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.position.y = 0;
  pitchMesh.receiveShadow = true;
  group.add(pitchMesh);
  disposables.push(pitchGeo, pitchTex, pitchMat);

  // 3. Goals (Metallic Goalposts + Woven Nets at z = -length/2 and z = +length/2)
  const goalWidth = 9.6;
  const goalHeight = 3.3;
  const goalDepth = 2.6;

  const postMat = new THREE.MeshStandardMaterial({
    color: '#F1F5F9',
    roughness: 0.22,
    metalness: 0.85,
  });
  const netTex = createGoalNetTexture(maxAnisotropy);
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    roughness: 0.8,
    depthWrite: false,
  });
  disposables.push(postMat, netTex, netMat);

  const postGeo = new THREE.CylinderGeometry(0.08, 0.08, goalHeight, 12);
  const crossbarGeo = new THREE.CylinderGeometry(0.08, 0.08, goalWidth + 0.16, 12);
  const backBarGeo = new THREE.CylinderGeometry(0.045, 0.045, goalDepth, 8);
  disposables.push(postGeo, crossbarGeo, backBarGeo);

  interface DeformableNetPanel {
    geo: THREE.PlaneGeometry;
    baseZ: Float32Array;
    baseX: Float32Array;
    baseY: Float32Array;
    halfU: number;
    halfV: number;
    pinBottom: boolean;
    outSign: number;
  }

  interface GoalNetSim {
    zSign: -1 | 1;
    zLine: number;
    back: DeformableNetPanel;
    left: DeformableNetPanel;
    right: DeformableNetPanel;
    top: DeformableNetPanel;
    impactX: number;
    impactY: number;
    impactAmp: number;
    impactTime: number;
    dirty: boolean;
  }

  const goalNetSims: GoalNetSim[] = [];

  const registerNetPanel = (
    geo: THREE.PlaneGeometry,
    halfU: number,
    halfV: number,
    pinBottom: boolean,
    outSign: number,
  ): DeformableNetPanel => {
    disposables.push(geo);
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const count = posAttr.count;
    const baseX = new Float32Array(count);
    const baseY = new Float32Array(count);
    const baseZ = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      baseX[i] = posAttr.getX(i);
      baseY[i] = posAttr.getY(i);
      baseZ[i] = posAttr.getZ(i);
    }
    return { geo, baseX, baseY, baseZ, halfU, halfV, pinBottom, outSign };
  };

  const buildGoal = (zSign: -1 | 1) => {
    const goalGroup = new THREE.Group();
    const zLine = zSign * (length / 2);
    goalGroup.position.set(0, 0, zLine);

    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-goalWidth / 2, goalHeight / 2, 0);
    leftPost.castShadow = true;

    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(goalWidth / 2, goalHeight / 2, 0);
    rightPost.castShadow = true;

    const crossbar = new THREE.Mesh(crossbarGeo, postMat);
    crossbar.rotation.z = Math.PI / 2;
    crossbar.position.set(0, goalHeight, 0);
    crossbar.castShadow = true;

    const leftStanchion = new THREE.Mesh(backBarGeo, postMat);
    leftStanchion.rotation.x = Math.PI / 2;
    leftStanchion.position.set(-goalWidth / 2, goalHeight, zSign * (goalDepth / 2));

    const rightStanchion = new THREE.Mesh(backBarGeo, postMat);
    rightStanchion.rotation.x = Math.PI / 2;
    rightStanchion.position.set(goalWidth / 2, goalHeight, zSign * (goalDepth / 2));

    const backGeo = new THREE.PlaneGeometry(goalWidth, goalHeight, 14, 7);
    const sideLeftGeo = new THREE.PlaneGeometry(goalDepth, goalHeight, 7, 7);
    const sideRightGeo = new THREE.PlaneGeometry(goalDepth, goalHeight, 7, 7);
    const topGeo = new THREE.PlaneGeometry(goalWidth, goalDepth, 14, 7);

    const netBack = new THREE.Mesh(backGeo, netMat);
    netBack.position.set(0, goalHeight / 2, zSign * goalDepth);

    const netLeft = new THREE.Mesh(sideLeftGeo, netMat);
    netLeft.rotation.y = Math.PI / 2;
    netLeft.position.set(-goalWidth / 2, goalHeight / 2, zSign * (goalDepth / 2));

    const netRight = new THREE.Mesh(sideRightGeo, netMat);
    netRight.rotation.y = Math.PI / 2;
    netRight.position.set(goalWidth / 2, goalHeight / 2, zSign * (goalDepth / 2));

    const netTop = new THREE.Mesh(topGeo, netMat);
    netTop.rotation.x = Math.PI / 2;
    netTop.position.set(0, goalHeight, zSign * (goalDepth / 2));

    goalNetSims.push({
      zSign,
      zLine,
      back: registerNetPanel(backGeo, goalWidth / 2, goalHeight / 2, true, zSign),
      left: registerNetPanel(sideLeftGeo, goalDepth / 2, goalHeight / 2, true, -1),
      right: registerNetPanel(sideRightGeo, goalDepth / 2, goalHeight / 2, true, 1),
      top: registerNetPanel(topGeo, goalWidth / 2, goalDepth / 2, false, -1),
      impactX: 0,
      impactY: goalHeight * 0.45,
      impactAmp: 0,
      impactTime: 0,
      dirty: false,
    });

    goalGroup.add(
      leftPost,
      rightPost,
      crossbar,
      leftStanchion,
      rightStanchion,
      netBack,
      netLeft,
      netRight,
      netTop,
    );
    group.add(goalGroup);
  };

  buildGoal(-1); // Away goal (-Z)
  buildGoal(1); // Home goal (+Z)

  // 4. Corner Flags
  const flagPoleGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.45, 8);
  const flagClothGeo = new THREE.PlaneGeometry(0.45, 0.3);
  const flagPoleMat = new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.4 });
  const flagClothMat = new THREE.MeshStandardMaterial({
    color: '#EF4444',
    side: THREE.DoubleSide,
    roughness: 0.7,
  });
  disposables.push(flagPoleGeo, flagClothGeo, flagPoleMat, flagClothMat);

  const corners: [number, number][] = [
    [-width / 2, -length / 2],
    [width / 2, -length / 2],
    [-width / 2, length / 2],
    [width / 2, length / 2],
  ];
  for (const [cx, cz] of corners) {
    const pole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
    pole.position.set(cx, 0.725, cz);
    const cloth = new THREE.Mesh(flagClothGeo, flagClothMat);
    cloth.position.set(cx + 0.22, 1.28, cz);
    group.add(pole, cloth);
  }

  // 5. LED Perimeter Advertising Boards + Realistic Sideline Buffer Zone
  const boardH = 1.05;
  const boardOffsetX = width / 2 + 5.6;
  const boardOffsetZ = length / 2 + 5.6;
  const adTex = createAdBoardTexture(homeClub, awayClub, maxAnisotropy);
  const adMat = new THREE.MeshStandardMaterial({
    map: adTex,
    emissive: '#FFFFFF',
    emissiveMap: adTex,
    emissiveIntensity: 0.34,
    roughness: 0.35,
    metalness: 0.15,
  });
  const boardBackMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    roughness: 0.7,
    metalness: 0.3,
  });

  const sideAdGeo = new THREE.BoxGeometry(0.34, boardH, length + 9.2);
  const endAdGeo = new THREE.BoxGeometry(width + 9.2, boardH, 0.34);
  disposables.push(adTex, adMat, boardBackMat, sideAdGeo, endAdGeo);

  const leftBoard = new THREE.Mesh(sideAdGeo, [
    adMat,
    boardBackMat,
    boardBackMat,
    boardBackMat,
    boardBackMat,
    boardBackMat,
  ]);
  leftBoard.position.set(-boardOffsetX, boardH / 2, 0);

  const rightBoard = new THREE.Mesh(sideAdGeo, [
    boardBackMat,
    adMat,
    boardBackMat,
    boardBackMat,
    boardBackMat,
    boardBackMat,
  ]);
  rightBoard.position.set(boardOffsetX, boardH / 2, 0);

  const northBoard = new THREE.Mesh(endAdGeo, [
    boardBackMat,
    boardBackMat,
    boardBackMat,
    boardBackMat,
    adMat,
    boardBackMat,
  ]);
  northBoard.position.set(0, boardH / 2, -boardOffsetZ);

  const southBoard = new THREE.Mesh(endAdGeo, [
    boardBackMat,
    boardBackMat,
    boardBackMat,
    boardBackMat,
    boardBackMat,
    adMat,
  ]);
  southBoard.position.set(0, boardH / 2, boardOffsetZ);
  group.add(leftBoard, rightBoard, northBoard, southBoard);

  // 5B. Lively Sidelines: Team Technical Dugouts, Seated Coaches/Subs, Equipment Tables, Photographers & Stewards
  const steelMat = new THREE.MeshStandardMaterial({
    color: '#475569',
    roughness: 0.35,
    metalness: 0.78,
  });
  const glassCanopyMat = new THREE.MeshStandardMaterial({
    color: '#93C5FD',
    transparent: true,
    opacity: 0.34,
    roughness: 0.15,
    metalness: 0.25,
    side: THREE.DoubleSide,
  });
  const tableMat = new THREE.MeshStandardMaterial({ color: '#E2E8F0', roughness: 0.55 });
  const bottleMat = new THREE.MeshStandardMaterial({ color: '#38BDF8', roughness: 0.25 });
  const cameraMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.4, metalness: 0.5 });
  const lensMat = new THREE.MeshStandardMaterial({ color: '#94A3B8', roughness: 0.25, metalness: 0.85 });
  const subSkinMat = new THREE.MeshStandardMaterial({ color: '#DDA783', roughness: 0.65 });
  const darkPantsMat = new THREE.MeshStandardMaterial({ color: '#0F172A', roughness: 0.8 });

  const dugoutRoofGeo = new THREE.BoxGeometry(1.75, 0.08, 6.2);
  const dugoutBackGeo = new THREE.BoxGeometry(0.08, 1.85, 6.2);
  const dugoutSideGeo = new THREE.BoxGeometry(1.75, 1.85, 0.08);
  const dugoutBaseGeo = new THREE.BoxGeometry(1.9, 0.12, 6.4);
  const seatBackGeo = new THREE.BoxGeometry(0.14, 0.55, 0.44);
  const seatPanGeo = new THREE.BoxGeometry(0.42, 0.12, 0.44);
  const subTorsoGeo = new THREE.BoxGeometry(0.36, 0.48, 0.28);
  const subHeadGeo = new THREE.SphereGeometry(0.12, 8, 6);
  const subLegsGeo = new THREE.BoxGeometry(0.32, 0.18, 0.32);
  const tableTopGeo = new THREE.BoxGeometry(0.7, 0.08, 1.35);
  const tableLegGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.68, 6);
  const bottleGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6);

  disposables.push(
    steelMat,
    glassCanopyMat,
    tableMat,
    bottleMat,
    cameraMat,
    lensMat,
    subSkinMat,
    darkPantsMat,
    dugoutRoofGeo,
    dugoutBackGeo,
    dugoutSideGeo,
    dugoutBaseGeo,
    seatBackGeo,
    seatPanGeo,
    subTorsoGeo,
    subHeadGeo,
    subLegsGeo,
    tableTopGeo,
    tableLegGeo,
    bottleGeo,
  );

  const buildTeamDugout = (team: 'home' | 'away', club: ClubConfig, zCenter: number) => {
    const dugout = new THREE.Group();
    const xPos = -width / 2 - 3.65;
    dugout.position.set(xPos, 0, zCenter);

    const base = new THREE.Mesh(dugoutBaseGeo, steelMat);
    base.position.set(0, 0.06, 0);
    const backWall = new THREE.Mesh(dugoutBackGeo, glassCanopyMat);
    backWall.position.set(-0.82, 0.98, 0);
    const roof = new THREE.Mesh(dugoutRoofGeo, glassCanopyMat);
    roof.position.set(0, 1.92, 0);
    roof.rotation.z = -0.14;
    const northWall = new THREE.Mesh(dugoutSideGeo, glassCanopyMat);
    northWall.position.set(0, 0.98, -3.08);
    const southWall = new THREE.Mesh(dugoutSideGeo, glassCanopyMat);
    southWall.position.set(0, 0.98, 3.08);
    dugout.add(base, backWall, roof, northWall, southWall);

    const seatMat = new THREE.MeshStandardMaterial({ color: club.primaryColor, roughness: 0.55 });
    const bibMat = new THREE.MeshStandardMaterial({
      color: team === 'home' ? club.accentColor : club.awayPrimary,
      roughness: 0.65,
    });
    const coachCoatMat = new THREE.MeshStandardMaterial({ color: '#1E293B', roughness: 0.7 });
    disposables.push(seatMat, bibMat, coachCoatMat);

    // 5 padded seats + 4 seated subs & 1 head coach
    for (let s = 0; s < 5; s++) {
      const sz = -2.2 + s * 1.1;
      const pan = new THREE.Mesh(seatPanGeo, seatMat);
      pan.position.set(-0.22, 0.44, sz);
      const sBack = new THREE.Mesh(seatBackGeo, seatMat);
      sBack.position.set(-0.42, 0.74, sz);
      dugout.add(pan, sBack);

      const torso = new THREE.Mesh(subTorsoGeo, s === 0 ? coachCoatMat : bibMat);
      torso.position.set(-0.22, 0.76, sz);
      const head = new THREE.Mesh(subHeadGeo, subSkinMat);
      head.position.set(-0.22, 1.12, sz);
      const legs = new THREE.Mesh(subLegsGeo, darkPantsMat);
      legs.position.set(-0.04, 0.36, sz);
      dugout.add(torso, head, legs);
    }

    // Water/Equipment Table flanking the dugout
    const tz = team === 'home' ? zCenter + 4.1 : zCenter - 4.1;
    const tblTop = new THREE.Mesh(tableTopGeo, tableMat);
    tblTop.position.set(xPos - 0.1, 0.7, tz);
    group.add(tblTop);
    for (const [lx, lz] of [
      [-0.25, -0.52],
      [0.25, -0.52],
      [-0.25, 0.52],
      [0.25, 0.52],
    ]) {
      const leg = new THREE.Mesh(tableLegGeo, steelMat);
      leg.position.set(xPos - 0.1 + lx, 0.34, tz + lz);
      group.add(leg);
    }
    for (let b = 0; b < 3; b++) {
      const bottle = new THREE.Mesh(bottleGeo, bottleMat);
      bottle.position.set(xPos - 0.1, 0.85, tz - 0.3 + b * 0.3);
      group.add(bottle);
    }

    group.add(dugout);
  };

  buildTeamDugout('away', awayClub, -9.2);
  buildTeamDugout('home', homeClub, 9.2);

  // Pitchside Photographers behind North and South Goal Lines
  const tripodLegGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.85, 5);
  const camBodyGeo = new THREE.BoxGeometry(0.24, 0.18, 0.28);
  const camLensGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.36, 8);
  const mediaVestMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.75 });
  disposables.push(tripodLegGeo, camBodyGeo, camLensGeo, mediaVestMat);

  const photoPositions: [number, number, number][] = [
    [-11, -length / 2 - 2.9, 0],
    [-7.5, -length / 2 - 2.9, 0],
    [8.2, -length / 2 - 2.9, 0],
    [-8.2, length / 2 + 2.9, Math.PI],
    [7.5, length / 2 + 2.9, Math.PI],
    [11, length / 2 + 2.9, Math.PI],
  ];
  for (const [px, pz, pry] of photoPositions) {
    const pGroup = new THREE.Group();
    pGroup.position.set(px, 0, pz);
    pGroup.rotation.y = pry;

    const torso = new THREE.Mesh(subTorsoGeo, mediaVestMat);
    torso.position.set(0, 0.56, -0.22);
    const head = new THREE.Mesh(subHeadGeo, subSkinMat);
    head.position.set(0, 0.92, -0.18);
    const legs = new THREE.Mesh(subLegsGeo, darkPantsMat);
    legs.position.set(0, 0.22, -0.22);
    const camBody = new THREE.Mesh(camBodyGeo, cameraMat);
    camBody.position.set(0, 0.86, 0.14);
    const camLens = new THREE.Mesh(camLensGeo, lensMat);
    camLens.rotation.x = Math.PI / 2;
    camLens.position.set(0, 0.86, 0.36);
    const tripod = new THREE.Mesh(tripodLegGeo, steelMat);
    tripod.position.set(0, 0.42, 0.16);
    pGroup.add(torso, head, legs, camBody, camLens, tripod);
    group.add(pGroup);
  }

  // Animated Patrolling Sideline Marshals / Stewards (8 hi-vis stewards around perimeter)
  const STEWARD_COUNT = 8;
  const stewardVestMat = new THREE.MeshStandardMaterial({
    color: '#FACC15',
    emissive: '#CA8A04',
    emissiveIntensity: 0.2,
    roughness: 0.65,
  });
  const stewardTorsoGeo = new THREE.BoxGeometry(0.38, 0.56, 0.24);
  const stewardLegsGeo = new THREE.BoxGeometry(0.28, 0.62, 0.22);
  disposables.push(stewardVestMat, stewardTorsoGeo, stewardLegsGeo);

  const stewardGroups: THREE.Group[] = [];
  const stewardBaseX = new Float32Array(STEWARD_COUNT);
  const stewardBaseZ = new Float32Array(STEWARD_COUNT);
  const stewardAxisX = new Float32Array(STEWARD_COUNT);
  const stewardAxisZ = new Float32Array(STEWARD_COUNT);
  const stewardPhase = new Float32Array(STEWARD_COUNT);

  const stewardAnchors: [number, number, number, number, number][] = [
    [width / 2 + 2.8, -length * 0.28, 0, 1, 0],
    [width / 2 + 2.8, length * 0.28, 0, 1, 1.7],
    [-width / 2 - 2.6, -length * 0.36, 0, 1, 0.8],
    [-width / 2 - 2.6, length * 0.36, 0, 1, 2.5],
    [-width * 0.28, -length / 2 - 3.6, 1, 0, 1.1],
    [width * 0.28, -length / 2 - 3.6, 1, 0, 3.3],
    [-width * 0.28, length / 2 + 3.6, 1, 0, 0.4],
    [width * 0.28, length / 2 + 3.6, 1, 0, 2.9],
  ];
  for (let i = 0; i < STEWARD_COUNT; i++) {
    const [sx, sz, ax, az, ph] = stewardAnchors[i];
    stewardBaseX[i] = sx;
    stewardBaseZ[i] = sz;
    stewardAxisX[i] = ax;
    stewardAxisZ[i] = az;
    stewardPhase[i] = ph;

    const sg = new THREE.Group();
    const sLegs = new THREE.Mesh(stewardLegsGeo, darkPantsMat);
    sLegs.position.y = 0.31;
    const sTorso = new THREE.Mesh(stewardTorsoGeo, stewardVestMat);
    sTorso.position.y = 0.9;
    const sHead = new THREE.Mesh(subHeadGeo, subSkinMat);
    sHead.position.y = 1.32;
    sg.add(sLegs, sTorso, sHead);
    sg.position.set(sx, 0, sz);
    group.add(sg);
    stewardGroups.push(sg);
  }

  // 6. Sculpted Multi-Tiered Curved European Bowl, Curved Corners & Structural Roof Canopy
  const standConcreteMat = new THREE.MeshStandardMaterial({
    color: '#1E293B',
    roughness: 0.84,
    metalness: 0.08,
  });
  const seatRowMat = new THREE.MeshStandardMaterial({
    color: '#1D3557',
    roughness: 0.72,
    metalness: 0.14,
  });
  const upperRowMat = new THREE.MeshStandardMaterial({
    color: '#283B54',
    roughness: 0.74,
    metalness: 0.14,
  });
  const wallOuterMat = new THREE.MeshStandardMaterial({
    color: '#09111E',
    roughness: 0.48,
    metalness: 0.52,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: '#0F172A',
    roughness: 0.38,
    metalness: 0.68,
    side: THREE.DoubleSide,
  });
  const trussMat = new THREE.MeshStandardMaterial({
    color: '#64748B',
    roughness: 0.34,
    metalness: 0.8,
  });
  const fasciaMat = new THREE.MeshStandardMaterial({
    color: homeClub.accentColor,
    emissive: homeClub.accentColor,
    emissiveIntensity: 0.58,
    roughness: 0.28,
  });
  const midRibbonMat = new THREE.MeshStandardMaterial({
    color: awayClub.accentColor,
    emissive: homeClub.primaryColor,
    emissiveIntensity: 0.42,
    roughness: 0.32,
  });
  disposables.push(
    standConcreteMat,
    seatRowMat,
    upperRowMat,
    wallOuterMat,
    roofMat,
    trussMat,
    fasciaMat,
    midRibbonMat,
  );

  // 6 stepped concrete/seat tiers (3 lower bowl + concourse ribbon + 3 upper bowl) along all 4 straight sides
  const sideLen = length + 10.5;
  const endLen = width + 10.5;
  const tierCount = 6;
  const tierBaseInset = 3.0;
  const tierStepDepth = 2.15;

  for (let t = 0; t < tierCount; t++) {
    const isUpper = t >= 3;
    const stepW = 2.35;
    const stepH = 1.65 + t * 1.48 + (isUpper ? 1.1 : 0);
    const inset = tierBaseInset + t * tierStepDepth + (isUpper ? 0.9 : 0);
    const yCenter = stepH / 2;

    const sGeo = new THREE.BoxGeometry(stepW, stepH, sideLen);
    const eGeo = new THREE.BoxGeometry(endLen, stepH, stepW);
    disposables.push(sGeo, eGeo);

    const mat = isUpper ? (t % 2 === 0 ? standConcreteMat : upperRowMat) : (t % 2 === 0 ? standConcreteMat : seatRowMat);
    const wTier = new THREE.Mesh(sGeo, mat);
    wTier.position.set(-boardOffsetX - inset, yCenter, 0);
    const eTier = new THREE.Mesh(sGeo, mat);
    eTier.position.set(boardOffsetX + inset, yCenter, 0);
    const nTier = new THREE.Mesh(eGeo, mat);
    nTier.position.set(0, yCenter, -boardOffsetZ - inset);
    const sTier = new THREE.Mesh(eGeo, mat);
    sTier.position.set(0, yCenter, boardOffsetZ + inset);
    group.add(wTier, eTier, nTier, sTier);
  }

  // Curved Corner Bowl Sectors (Cylindrical stepped arcs sealing all 4 corners smoothly into a modern oval bowl)
  const cornerPivotX = sideLen / 2 > endLen / 2 ? boardOffsetX : boardOffsetX;
  const cornerCenterX = endLen / 2;
  const cornerCenterZ = sideLen / 2;
  const cornerSpanX = Math.max(2, boardOffsetX - cornerCenterX);
  const cornerSpanZ = Math.max(2, boardOffsetZ - cornerCenterZ);
  const cornerInnerRadius = Math.max(cornerSpanX, cornerSpanZ) + 1.8;

  for (let t = 0; t < tierCount; t++) {
    const isUpper = t >= 3;
    const stepH = 1.65 + t * 1.48 + (isUpper ? 1.1 : 0);
    const rOuter = cornerInnerRadius + (t + 1) * tierStepDepth + (isUpper ? 0.9 : 0);
    const rInner = Math.max(0.5, rOuter - 2.4);
    const arcShape = new THREE.Shape();
    arcShape.absarc(0, 0, rOuter, 0, Math.PI / 2, false);
    arcShape.lineTo(0, rInner);
    arcShape.absarc(0, 0, rInner, Math.PI / 2, 0, true);
    arcShape.closePath();

    const cornerArcGeo = new THREE.ExtrudeGeometry(arcShape, {
      depth: stepH,
      bevelEnabled: false,
      curveSegments: 10,
    });
    cornerArcGeo.rotateX(-Math.PI / 2);
    disposables.push(cornerArcGeo);

    const cMat = isUpper ? upperRowMat : seatRowMat;
    const cornerConfigs: [number, number, number][] = [
      [cornerCenterX, cornerCenterZ, -Math.PI / 2],
      [-cornerCenterX, cornerCenterZ, Math.PI],
      [-cornerCenterX, -cornerCenterZ, Math.PI / 2],
      [cornerCenterX, -cornerCenterZ, 0],
    ];
    for (const [cx, cz, rot] of cornerConfigs) {
      const m = new THREE.Mesh(cornerArcGeo, cMat);
      m.position.set(cx, 0, cz);
      m.rotation.y = rot;
      group.add(m);
    }
  }
  void cornerPivotX;

  // Mid-Tier Glowing Broadcast Ribbon + Outer Curved Stadium Shell + Overhanging Roof Canopy & Trusses
  const outerWallDistX = boardOffsetX + tierBaseInset + tierCount * tierStepDepth + 2.4;
  const outerWallDistZ = boardOffsetZ + tierBaseInset + tierCount * tierStepDepth + 2.4;
  const wallH = 16.5;

  const outerWallSideGeo = new THREE.BoxGeometry(2.0, wallH, sideLen + 2);
  const outerWallEndGeo = new THREE.BoxGeometry(endLen + 2, wallH, 2.0);
  const roofSideGeo = new THREE.BoxGeometry(16.8, 0.65, sideLen + 2);
  const roofEndGeo = new THREE.BoxGeometry(endLen + 2, 0.65, 16.8);
  const fasciaSideGeo = new THREE.BoxGeometry(0.32, 0.48, sideLen);
  const fasciaEndGeo = new THREE.BoxGeometry(endLen, 0.48, 0.32);
  const ribbonSideGeo = new THREE.BoxGeometry(0.28, 0.55, sideLen);
  const ribbonEndGeo = new THREE.BoxGeometry(endLen, 0.55, 0.28);
  const trussGeo = new THREE.BoxGeometry(16.2, 0.45, 0.42);
  disposables.push(
    outerWallSideGeo,
    outerWallEndGeo,
    roofSideGeo,
    roofEndGeo,
    fasciaSideGeo,
    fasciaEndGeo,
    ribbonSideGeo,
    ribbonEndGeo,
    trussGeo,
  );

  // Outer straight walls
  const wallW = new THREE.Mesh(outerWallSideGeo, wallOuterMat);
  wallW.position.set(-outerWallDistX, wallH / 2, 0);
  const wallE = new THREE.Mesh(outerWallSideGeo, wallOuterMat);
  wallE.position.set(outerWallDistX, wallH / 2, 0);
  const wallN = new THREE.Mesh(outerWallEndGeo, wallOuterMat);
  wallN.position.set(0, wallH / 2, -outerWallDistZ);
  const wallS = new THREE.Mesh(outerWallEndGeo, wallOuterMat);
  wallS.position.set(0, wallH / 2, outerWallDistZ);
  group.add(wallW, wallE, wallN, wallS);

  // Outer curved corner walls & curved corner roof canopies
  const cornerOuterR = cornerInnerRadius + tierCount * tierStepDepth + 3.2;
  const cornerRoofInnerR = Math.max(1.0, cornerOuterR - 16.5);
  const cornerWallArc = new THREE.CylinderGeometry(
    cornerOuterR,
    cornerOuterR,
    wallH,
    12,
    1,
    true,
    0,
    Math.PI / 2,
  );
  const cornerRoofShape = new THREE.Shape();
  cornerRoofShape.absarc(0, 0, cornerOuterR + 0.8, 0, Math.PI / 2, false);
  cornerRoofShape.lineTo(0, cornerRoofInnerR);
  cornerRoofShape.absarc(0, 0, cornerRoofInnerR, Math.PI / 2, 0, true);
  cornerRoofShape.closePath();
  const cornerRoofGeo = new THREE.ExtrudeGeometry(cornerRoofShape, {
    depth: 0.65,
    bevelEnabled: false,
    curveSegments: 12,
  });
  cornerRoofGeo.rotateX(-Math.PI / 2);
  disposables.push(cornerWallArc, cornerRoofGeo);

  const cornerShellPts: [number, number, number][] = [
    [cornerCenterX, cornerCenterZ, 0],
    [-cornerCenterX, cornerCenterZ, -Math.PI / 2],
    [-cornerCenterX, -cornerCenterZ, Math.PI],
    [cornerCenterX, -cornerCenterZ, Math.PI / 2],
  ];
  for (const [cx, cz, rot] of cornerShellPts) {
    const cw = new THREE.Mesh(cornerWallArc, wallOuterMat);
    cw.position.set(cx, wallH / 2, cz);
    cw.rotation.y = rot;
    group.add(cw);
  }
  const cornerRoofPts: [number, number, number][] = [
    [cornerCenterX, cornerCenterZ, -Math.PI / 2],
    [-cornerCenterX, cornerCenterZ, Math.PI],
    [-cornerCenterX, -cornerCenterZ, Math.PI / 2],
    [cornerCenterX, -cornerCenterZ, 0],
  ];
  for (const [cx, cz, rot] of cornerRoofPts) {
    const cr = new THREE.Mesh(cornerRoofGeo, roofMat);
    cr.position.set(cx, 16.4, cz);
    cr.rotation.y = rot;
    group.add(cr);
  }

  // Overhanging Straight Roofs (leaving center pitch open to the night sky)
  const rWest = new THREE.Mesh(roofSideGeo, roofMat);
  rWest.position.set(-boardOffsetX - 9.2, 16.4, 0);
  rWest.rotation.z = -0.06;
  const rEast = new THREE.Mesh(roofSideGeo, roofMat);
  rEast.position.set(boardOffsetX + 9.2, 16.4, 0);
  rEast.rotation.z = 0.06;
  const rNorth = new THREE.Mesh(roofEndGeo, roofMat);
  rNorth.position.set(0, 16.4, -boardOffsetZ - 9.2);
  rNorth.rotation.x = 0.06;
  const rSouth = new THREE.Mesh(roofEndGeo, roofMat);
  rSouth.position.set(0, 16.4, boardOffsetZ + 9.2);
  rSouth.rotation.x = -0.06;
  group.add(rWest, rEast, rNorth, rSouth);

  // Cantilever Steel Roof Trusses along East/West and North/South stands
  const sideTrusses = 7;
  for (let i = 0; i < sideTrusses; i++) {
    const z = -sideLen * 0.44 + (i / (sideTrusses - 1)) * (sideLen * 0.88);
    const tW = new THREE.Mesh(trussGeo, trussMat);
    tW.position.set(-boardOffsetX - 9.2, 15.85, z);
    tW.rotation.z = -0.06;
    const tE = new THREE.Mesh(trussGeo, trussMat);
    tE.position.set(boardOffsetX + 9.2, 15.85, z);
    tE.rotation.z = 0.06;
    group.add(tW, tE);
  }
  const endTrusses = 5;
  for (let i = 0; i < endTrusses; i++) {
    const x = -endLen * 0.4 + (i / (endTrusses - 1)) * (endLen * 0.8);
    const tN = new THREE.Mesh(trussGeo, trussMat);
    tN.rotation.y = Math.PI / 2;
    tN.rotation.x = 0.06;
    tN.position.set(x, 15.85, -boardOffsetZ - 9.2);
    const tS = new THREE.Mesh(trussGeo, trussMat);
    tS.rotation.y = Math.PI / 2;
    tS.rotation.x = -0.06;
    tS.position.set(x, 15.85, boardOffsetZ + 9.2);
    group.add(tN, tS);
  }

  // Roof Rim Fascia & Mid-Bowl LED Ribbon
  const fWest = new THREE.Mesh(fasciaSideGeo, fasciaMat);
  fWest.position.set(-boardOffsetX - 1.1, 15.85, 0);
  const fEast = new THREE.Mesh(fasciaSideGeo, fasciaMat);
  fEast.position.set(boardOffsetX + 1.1, 15.85, 0);
  const fNorth = new THREE.Mesh(fasciaEndGeo, fasciaMat);
  fNorth.position.set(0, 15.85, -boardOffsetZ - 1.1);
  const fSouth = new THREE.Mesh(fasciaEndGeo, fasciaMat);
  fSouth.position.set(0, 15.85, boardOffsetZ + 1.1);

  const midInset = tierBaseInset + 3 * tierStepDepth - 0.8;
  const mWest = new THREE.Mesh(ribbonSideGeo, midRibbonMat);
  mWest.position.set(-boardOffsetX - midInset, 6.2, 0);
  const mEast = new THREE.Mesh(ribbonSideGeo, midRibbonMat);
  mEast.position.set(boardOffsetX + midInset, 6.2, 0);
  const mNorth = new THREE.Mesh(ribbonEndGeo, midRibbonMat);
  mNorth.position.set(0, 6.2, -boardOffsetZ - midInset);
  const mSouth = new THREE.Mesh(ribbonEndGeo, midRibbonMat);
  mSouth.position.set(0, 6.2, boardOffsetZ + midInset);
  group.add(fWest, fEast, fNorth, fSouth, mWest, mEast, mNorth, mSouth);

  // 7. Dense, Colorful Animated 3D Crowd (InstancedMesh Torso + Head + Cheering Arms)
  const MAX_CROWD = 840;
  const crowdBodyGeo = new THREE.BoxGeometry(0.46, 0.56, 0.34);
  const crowdHeadGeo = new THREE.SphereGeometry(0.14, 7, 6);
  const crowdArmsGeo = new THREE.BoxGeometry(0.76, 0.14, 0.16);
  const crowdMat = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    roughness: 0.8,
    metalness: 0.05,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: '#E6B89C',
    roughness: 0.65,
    metalness: 0.02,
  });

  const crowdBodies = new THREE.InstancedMesh(crowdBodyGeo, crowdMat, MAX_CROWD);
  const crowdHeads = new THREE.InstancedMesh(crowdHeadGeo, headMat, MAX_CROWD);
  const crowdArms = new THREE.InstancedMesh(crowdArmsGeo, crowdMat, MAX_CROWD);

  const baseX = new Float32Array(MAX_CROWD);
  const baseY = new Float32Array(MAX_CROWD);
  const baseZ = new Float32Array(MAX_CROWD);
  const baseRotY = new Float32Array(MAX_CROWD);
  const basePhase = new Float32Array(MAX_CROWD);
  const baseScale = new Float32Array(MAX_CROWD);

  const dummy = new THREE.Object3D();
  const cHome = new THREE.Color(homeClub.primaryColor);
  const cAway = new THREE.Color(awayClub.primaryColor);
  const cAccent = new THREE.Color('#F8FAFC');
  const cWarm = new THREE.Color('#F59E0B');
  const cCasual = new THREE.Color('#475569');
  const cSky = new THREE.Color('#38BDF8');
  const tempColor = new THREE.Color();

  for (let i = 0; i < MAX_CROWD; i++) {
    const tier = i % tierCount;
    const isUpper = tier >= 3;
    const inset = tierBaseInset + tier * tierStepDepth + (isUpper ? 0.9 : 0);
    const seatY = 1.95 + tier * 1.48 + (isUpper ? 1.1 : 0);

    let x = 0;
    let z = 0;
    let ry = 0;

    // 78% on straight stands, 22% wrapping curved corners
    if (i % 9 < 7) {
      const side = i % 4;
      const spanT = (((i * 43) % MAX_CROWD) / MAX_CROWD - 0.5) * 0.94;
      if (side === 0) {
        x = -boardOffsetX - inset;
        z = spanT * sideLen;
        ry = Math.PI / 2;
      } else if (side === 1) {
        x = boardOffsetX + inset;
        z = spanT * sideLen;
        ry = -Math.PI / 2;
      } else if (side === 2) {
        x = spanT * endLen;
        z = -boardOffsetZ - inset;
        ry = 0;
      } else {
        x = spanT * endLen;
        z = boardOffsetZ + inset;
        ry = Math.PI;
      }
    } else {
      const cornerIdx = i % 4;
      const rad = cornerInnerRadius + (tier + 0.5) * tierStepDepth + (isUpper ? 0.9 : 0);
      const ang = (0.14 + ((i * 29) % 100) / 100 * 0.72) * (Math.PI / 2);
      const sx = cornerIdx === 0 || cornerIdx === 3 ? 1 : -1;
      const sz = cornerIdx === 0 || cornerIdx === 1 ? 1 : -1;
      x = sx * (cornerCenterX + Math.cos(ang) * rad);
      z = sz * (cornerCenterZ + Math.sin(ang) * rad);
      ry = Math.atan2(-x, -z);
    }

    const s = 0.88 + Math.random() * 0.24;
    baseX[i] = x;
    baseY[i] = seatY;
    baseZ[i] = z;
    baseRotY[i] = ry;
    basePhase[i] = Math.random() * Math.PI * 2;
    baseScale[i] = s;

    dummy.position.set(x, seatY, z);
    dummy.rotation.set(0, ry, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    crowdBodies.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, seatY + 0.42 * s, z);
    dummy.updateMatrix();
    crowdHeads.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, seatY + 0.24 * s, z);
    dummy.updateMatrix();
    crowdArms.setMatrixAt(i, dummy.matrix);

    const pick = Math.random();
    if (pick < 0.36) tempColor.copy(cHome);
    else if (pick < 0.68) tempColor.copy(cAway);
    else if (pick < 0.8) tempColor.copy(cAccent);
    else if (pick < 0.89) tempColor.copy(cWarm);
    else if (pick < 0.95) tempColor.copy(cCasual);
    else tempColor.copy(cSky);
    crowdBodies.setColorAt(i, tempColor);
    crowdArms.setColorAt(i, tempColor);
  }

  crowdBodies.instanceMatrix.needsUpdate = true;
  crowdHeads.instanceMatrix.needsUpdate = true;
  crowdArms.instanceMatrix.needsUpdate = true;
  if (crowdBodies.instanceColor) crowdBodies.instanceColor.needsUpdate = true;
  if (crowdArms.instanceColor) crowdArms.instanceColor.needsUpdate = true;
  crowdBodies.computeBoundingSphere();
  crowdHeads.computeBoundingSphere();
  crowdArms.computeBoundingSphere();
  group.add(crowdBodies, crowdHeads, crowdArms);
  disposables.push(crowdBodyGeo, crowdHeadGeo, crowdArmsGeo, crowdMat, headMat);

  // 8. Four Towering Stadium Floodlight Pylons + Light Beams
  const towerGeo = new THREE.CylinderGeometry(0.45, 0.78, 27, 10);
  const towerMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    roughness: 0.4,
    metalness: 0.75,
  });
  const lampPanelGeo = new THREE.BoxGeometry(5.6, 2.6, 0.45);
  const lampPanelMat = new THREE.MeshStandardMaterial({
    color: '#FFFBEB',
    emissive: '#FEF3C7',
    emissiveIntensity: 1.85,
    roughness: 0.2,
  });
  const beamGeo = new THREE.ConeGeometry(16, 36, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#FEF9C3',
    transparent: true,
    opacity: 0.045,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  disposables.push(towerGeo, towerMat, lampPanelGeo, lampPanelMat, beamGeo, beamMat);

  const lightBeams: THREE.Mesh[] = [];
  const towerPositions: [number, number][] = [
    [-boardOffsetX - 15.5, -boardOffsetZ - 15.5],
    [boardOffsetX + 15.5, -boardOffsetZ - 15.5],
    [-boardOffsetX - 15.5, boardOffsetZ + 15.5],
    [boardOffsetX + 15.5, boardOffsetZ + 15.5],
  ];
  for (const [tx, tz] of towerPositions) {
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.position.set(tx, 13.5, tz);
    const bank = new THREE.Mesh(lampPanelGeo, lampPanelMat);
    bank.position.set(tx, 27.0, tz);
    bank.lookAt(0, 0, 0);

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(tx * 0.56, 14.5, tz * 0.56);
    beam.lookAt(0, 0, 0);
    beam.rotateX(-Math.PI / 2);
    lightBeams.push(beam);

    group.add(tower, bank, beam);
  }

  let activeCrowdCount = MAX_CROWD;
  const setCrowdDensity = (q: GraphicsQuality) => {
    activeCrowdCount = q === 'low' ? 160 : q === 'medium' ? 440 : MAX_CROWD;
    crowdBodies.count = activeCrowdCount;
    crowdHeads.count = activeCrowdCount;
    crowdArms.count = activeCrowdCount;
    const showBeams = q !== 'low';
    for (const b of lightBeams) {
      b.visible = showBeams;
    }
    beamMat.opacity = q === 'high' ? 0.055 : 0.032;
  };
  setCrowdDensity(graphicsQuality);

  // Zero-GC Crowd + Steward Patrol Animation Helper
  const animDummy = new THREE.Object3D();
  const updateCrowdAnimation = (elapsedTime: number, excitement: number) => {
    const freq = 3.2 + excitement * 6.8;
    const amp = 0.035 + excitement * 0.48;
    const armLift = 0.14 + excitement * 0.36;

    for (let i = 0; i < activeCrowdCount; i++) {
      const wave = Math.sin(elapsedTime * freq + basePhase[i]);
      const jump = excitement > 0.52 ? Math.abs(wave) * amp : Math.max(0, wave) * amp;
      const s = baseScale[i];
      const bx = baseX[i];
      const by = baseY[i] + jump;
      const bz = baseZ[i];
      const ry = baseRotY[i];

      animDummy.position.set(bx, by, bz);
      animDummy.rotation.set(0, ry, 0);
      animDummy.scale.set(s, s, s);
      animDummy.updateMatrix();
      crowdBodies.setMatrixAt(i, animDummy.matrix);

      animDummy.position.set(bx, by + 0.42 * s, bz);
      animDummy.updateMatrix();
      crowdHeads.setMatrixAt(i, animDummy.matrix);

      const armOsc = Math.max(0, Math.sin(elapsedTime * (freq * 1.15) + basePhase[i] * 1.4));
      animDummy.position.set(bx, by + (0.16 + armOsc * armLift) * s, bz);
      animDummy.rotation.set(0, ry, Math.sin(elapsedTime * 5 + basePhase[i]) * (0.08 + excitement * 0.25));
      animDummy.updateMatrix();
      crowdArms.setMatrixAt(i, animDummy.matrix);
    }
    crowdBodies.instanceMatrix.needsUpdate = true;
    crowdHeads.instanceMatrix.needsUpdate = true;
    crowdArms.instanceMatrix.needsUpdate = true;

    // Gentle patrolling walk for pitchside stewards
    for (let i = 0; i < STEWARD_COUNT; i++) {
      const sg = stewardGroups[i];
      const patrol = Math.sin(elapsedTime * 0.42 + stewardPhase[i]) * 2.8;
      const px = stewardBaseX[i] + stewardAxisX[i] * patrol;
      const pz = stewardBaseZ[i] + stewardAxisZ[i] * patrol;
      const dir = Math.cos(elapsedTime * 0.42 + stewardPhase[i]) >= 0 ? 1 : -1;
      sg.position.set(px, Math.abs(Math.sin(elapsedTime * 3.8 + stewardPhase[i])) * 0.04, pz);
      sg.rotation.y =
        stewardAxisX[i] !== 0
          ? dir > 0
            ? Math.PI / 2
            : -Math.PI / 2
          : dir > 0
            ? 0
            : Math.PI;
    }
  };

  const applyPanelRipple = (
    panel: DeformableNetPanel,
    impactU: number,
    impactV: number,
    amp: number,
    time: number,
    attenuation: number,
  ) => {
    const posAttr = panel.geo.attributes.position as THREE.BufferAttribute;
    const count = posAttr.count;
    for (let i = 0; i < count; i++) {
      const bx = panel.baseX[i];
      const by = panel.baseY[i];
      const edgeU = Math.max(0, 1 - Math.abs(bx) / panel.halfU);
      const edgeV = panel.pinBottom
        ? Math.max(0, 1 - Math.abs(by) / panel.halfV)
        : Math.max(0, 1 - Math.abs(by) / panel.halfV);
      const pinMask = Math.min(1, edgeU * 2.2) * Math.min(1, edgeV * 2.2);
      if (pinMask <= 0.01) {
        posAttr.setZ(i, panel.baseZ[i]);
        continue;
      }
      const du = bx - impactU;
      const dv = by - impactV;
      const d = Math.hypot(du, dv);
      const falloff = Math.exp(-d * 0.45);
      const wave = Math.sin(time * 24 - d * 1.8) * 0.55 + 0.45;
      const disp = amp * attenuation * pinMask * falloff * wave * panel.outSign;
      posAttr.setZ(i, panel.baseZ[i] + disp);
    }
    posAttr.needsUpdate = true;
  };

  const resetPanel = (panel: DeformableNetPanel) => {
    const posAttr = panel.geo.attributes.position as THREE.BufferAttribute;
    const count = posAttr.count;
    for (let i = 0; i < count; i++) {
      posAttr.setZ(i, panel.baseZ[i]);
    }
    posAttr.needsUpdate = true;
  };

  const triggerGoalNetImpact = (
    zSign: -1 | 1,
    worldX: number,
    worldY: number,
    intensity: number,
  ) => {
    const sim = goalNetSims.find((g) => g.zSign === zSign);
    if (!sim) return;
    sim.impactX = THREE.MathUtils.clamp(worldX, -goalWidth * 0.48, goalWidth * 0.48);
    sim.impactY = THREE.MathUtils.clamp(worldY - goalHeight / 2, -goalHeight * 0.45, goalHeight * 0.45);
    sim.impactAmp = Math.max(sim.impactAmp, THREE.MathUtils.clamp(intensity, 0.16, 0.72));
    sim.impactTime = 0;
    sim.dirty = true;
  };

  const updateGoalNets = (dt: number) => {
    for (const sim of goalNetSims) {
      if (sim.impactAmp > 0.004) {
        sim.impactTime += dt;
        sim.impactAmp *= Math.exp(-3.2 * dt);
        applyPanelRipple(sim.back, sim.impactX, sim.impactY, sim.impactAmp, sim.impactTime, 1.0);
        applyPanelRipple(sim.left, 0, sim.impactY, sim.impactAmp, sim.impactTime, 0.45);
        applyPanelRipple(sim.right, 0, sim.impactY, sim.impactAmp, sim.impactTime, 0.45);
        applyPanelRipple(sim.top, sim.impactX, 0, sim.impactAmp, sim.impactTime, 0.45);
        sim.dirty = true;
      } else if (sim.dirty) {
        sim.impactAmp = 0;
        sim.dirty = false;
        resetPanel(sim.back);
        resetPanel(sim.left);
        resetPanel(sim.right);
        resetPanel(sim.top);
      }
    }
  };

  const resetGoalNets = () => {
    for (const sim of goalNetSims) {
      sim.impactAmp = 0;
      sim.impactTime = 0;
      if (sim.dirty) {
        sim.dirty = false;
        resetPanel(sim.back);
        resetPanel(sim.left);
        resetPanel(sim.right);
        resetPanel(sim.top);
      }
    }
  };

  return {
    group,
    disposables,
    shadowTexture: createContactShadowTexture(),
    setCrowdDensity,
    updateCrowdAnimation,
    triggerGoalNetImpact,
    updateGoalNets,
    resetGoalNets,
  };
}
