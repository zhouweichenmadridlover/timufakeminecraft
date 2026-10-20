// game.js
// 3D survival-game prototype with biomes, villages, mobs, mining,
// crafting, portals, combat, keyboard controls, and touch controls.

import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8cc8e8);
scene.fog = new THREE.Fog(0x8cc8e8, 90, 360);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  700
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();

const WORLD_SIZE = 512;
const CELL_SIZE = 8;
const HALF_WORLD = WORLD_SIZE / 2;

let seed = Math.floor(Math.random() * 999999);
let dimension = "overworld";
let gameStarted = true;
let yaw = 0;
let pitch = -0.25;
let timeOfDay = 0.25;
let selectedSlot = 0;
let miningTarget = null;
let miningProgress = 0;
let lastAttack = 0;
let lastDamage = 0;

const keys = {};
const mobs = [];
const blocks = [];
const portals = [];
const particles = [];
const inventory = {
  wood: 12,
  stone: 10,
  coal: 0,
  iron: 0,
  gold: 0,
  diamond: 0,
  obsidian: 0,
  leather: 0,
  meat: 0,
  arrows: 12,
  potion: 2
};

const hotbar = [
  "wood_pickaxe",
  "stone_pickaxe",
  "iron_sword",
  "bow",
  "axe",
  "arrow",
  "potion",
  "torch",
  "hand"
];

const player = {
  position: new THREE.Vector3(0, 14, 0),
  velocity: new THREE.Vector3(),
  health: 100,
  hunger: 100,
  stamina: 100,
  speed: 10,
  grounded: false,
  attacking: false,
  dead: false
};

const materials = {
  grass: new THREE.MeshLambertMaterial({ color: 0x4e9d45 }),
  forest: new THREE.MeshLambertMaterial({ color: 0x286d35 }),
  desert: new THREE.MeshLambertMaterial({ color: 0xd6b36a }),
  snow: new THREE.MeshLambertMaterial({ color: 0xeaf5ff }),
  stone: new THREE.MeshLambertMaterial({ color: 0x777777 }),
  sand: new THREE.MeshLambertMaterial({ color: 0xe1c27a }),
  water: new THREE.MeshPhongMaterial({
    color: 0x248dcc,
    transparent: true,
    opacity: 0.55
  }),
  wood: new THREE.MeshLambertMaterial({ color: 0x754822 }),
  leaves: new THREE.MeshLambertMaterial({ color: 0x1c6b32 }),
  snowLeaves: new THREE.MeshLambertMaterial({ color: 0x9bc4c7 }),
  gold: new THREE.MeshLambertMaterial({ color: 0xf5c542 }),
  iron: new THREE.MeshLambertMaterial({ color: 0xb9c0c7 }),
  diamond: new THREE.MeshLambertMaterial({ color: 0x39e5ee }),
  coal: new THREE.MeshLambertMaterial({ color: 0x181818 }),
  obsidian: new THREE.MeshLambertMaterial({ color: 0x241735 }),
  lava: new THREE.MeshBasicMaterial({ color: 0xff4c13 }),
  portalNether: new THREE.MeshBasicMaterial({
    color: 0xb329d8,
    transparent: true,
    opacity: 0.8
  }),
  portalEnd: new THREE.MeshBasicMaterial({
    color: 0x18e5c7,
    transparent: true,
    opacity: 0.8
  })
};

const ambientLight = new THREE.HemisphereLight(0xbde5ff, 0x334422, 1.5);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(80, 140, 60);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260;
sun.shadow.camera.bottom = -260;
scene.add(sun);

function mulberry32(value) {
  return function () {
    let t = (value += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let random = mulberry32(seed);

function noise(x, z) {
  const value =
    Math.sin(x * 0.035 + seed) * 0.5 +
    Math.cos(z * 0.027 - seed) * 0.35 +
    Math.sin((x + z) * 0.018) * 0.15;

  return (value + 1) / 2;
}

function biomeAt(x, z) {
  const n = noise(x, z);

  if (dimension === "nether") return "nether";
  if (dimension === "end") return "end";

  if (x < -130 && z < 60) return "desert";
  if (x > 120 && z < 80) return "snow";
  if (Math.abs(x) < 45 && Math.abs(z) > 75) return "river";
  if (n > 0.68) return "forest";
  return "grass";
}

function terrainHeight(x, z) {
  if (dimension === "end") {
    return 10 + Math.max(0, 14 - Math.sqrt(x * x + z * z) * 0.07);
  }

  if (dimension === "nether") {
    return 8 + noise(x, z) * 8;
  }

  const biome = biomeAt(x, z);
  let h = 6 + noise(x, z) * 7;

  if (biome === "desert") h += Math.sin(x * 0.04) * 5;
  if (biome === "snow") h += Math.sin(z * 0.05) * 6;
  if (biome === "forest") h += noise(x + 44, z - 21) * 5;
  if (biome === "river") h = 3.5;

  return h;
}

function addBox(
  position,
  size,
  material,
  options = {}
) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  mesh.userData = options.userData || {};
  scene.add(mesh);
  return mesh;
}

function addCylinder(
  position,
  radius,
  height,
  material,
  options = {}
) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 8);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  mesh.userData = options.userData || {};
  scene.add(mesh);
  return mesh;
}

function clearWorld() {
  for (const object of [...scene.children]) {
    if (
      object !== camera &&
      object !== sun &&
      object !== ambientLight &&
      object !== renderer
    ) {
      scene.remove(object);
    }
  }

  blocks.length = 0;
  mobs.length = 0;
  portals.length = 0;
  particles.length = 0;

  scene.add(ambientLight);
  scene.add(sun);
}

function createTerrain() {
  const cells = WORLD_SIZE / CELL_SIZE;

  for (let gx = -cells / 2; gx < cells / 2; gx++) {
    for (let gz = -cells / 2; gz < cells / 2; gz++) {
      const x = gx * CELL_SIZE + CELL_SIZE / 2;
      const z = gz * CELL_SIZE + CELL_SIZE / 2;

      if (dimension === "end" && Math.sqrt(x * x + z * z) > 180) {
        continue;
      }

      const biome = biomeAt(x, z);
      const height = terrainHeight(x, z);

      let material = materials.grass;

      if (biome === "desert") material = materials.desert;
      if (biome === "snow") material = materials.snow;
      if (biome === "forest") material = materials.forest;
      if (biome === "river") material = materials.sand;
      if (biome === "nether") material = materials.obsidian;
      if (biome === "end") material = materials.stone;

      const ground = addBox(
        new THREE.Vector3(x, height / 2, z),
        new THREE.Vector3(CELL_SIZE, height, CELL_SIZE),
        material,
        {
          userData: {
            type: "ground",
            biome,
            mineable: biome !== "river"
          }
        }
      );

      blocks.push(ground);

      if (biome === "river") {
        addBox(
          new THREE.Vector3(x, 4.1, z),
          new THREE.Vector3(CELL_SIZE, 0.25, CELL_SIZE),
          materials.water,
          { receiveShadow: false }
        );
      }

      if (Math.random() < 0.025) {
        addOre(x, height + 1, z);
      }

      if (biome === "forest" && Math.random() < 0.07) {
        createTree(x, height, z, false);
      }

      if (biome === "snow" && Math.random() < 0.06) {
        createTree(x, height, z, true);
      }

      if (biome === "desert" && Math.random() < 0.035) {
        createCactus(x, height, z);
      }
    }
  }

  if (dimension === "nether") createLavaPools();
  if (dimension === "end") createEndIslands();
}

function createTree(x, y, z, snowy) {
  addCylinder(
    new THREE.Vector3(x, y + 4, z),
    0.8,
    8,
    materials.wood,
    { userData: { type: "wood", mineable: true } }
  );

  addBox(
    new THREE.Vector3(x, y + 9, z),
    new THREE.Vector3(6, 5, 6),
    snowy ? materials.snowLeaves : materials.leaves,
    { userData: { type: "leaves" } }
  );
}

function createCactus(x, y, z) {
  addBox(
    new THREE.Vector3(x, y + 2, z),
    new THREE.Vector3(1.3, 4, 1.3),
    materials.forest,
    { userData: { type: "cactus", mineable: true } }
  );
}

function addOre(x, y, z) {
  const types = ["coal", "iron", "gold", "diamond", "obsidian"];
  const type = types[Math.floor(random() * types.length)];
  const material = materials[type];

  const ore = addBox(
    new THREE.Vector3(x, y + 1, z),
    new THREE.Vector3(1.5, 1.5, 1.5),
    material,
    {
      userData: {
        type: type,
        mineable: true,
        health: 3
      }
    }
  );

  blocks.push(ore);
}

function createLavaPools() {
  for (let i = 0; i < 14; i++) {
    const x = -190 + random() * 380;
    const z = -190 + random() * 380;

    addBox(
      new THREE.Vector3(x, 4.2, z),
      new THREE.Vector3(18, 0.2, 18),
      materials.lava,
      { receiveShadow: false }
    );
  }
}

function createEndIslands() {
  for (let i = 0; i < 25; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 80 + random() * 140;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 8 + random() * 20;

    addBox(
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(18 + random() * 24, 5, 18 + random() * 24),
      materials.stone
    );
  }
}

function createVillage(x, z) {
  const y = terrainHeight(x, z);

  for (let i = 0; i < 5; i++) {
    const ox = x + (i % 3) * 13 - 13;
    const oz = z + Math.floor(i / 3) * 15 - 8;

    addBox(
      new THREE.Vector3(ox, y + 3, oz),
      new THREE.Vector3(10, 6, 9),
      materials.wood
    );

    addBox(
      new THREE.Vector3(ox, y + 7, oz),
      new THREE.Vector3(11, 1.5, 10),
      materials.obsidian
    );

    addBox(
      new THREE.Vector3(ox, y + 1.3, oz + 5),
      new THREE.Vector3(2, 2.5, 0.3),
      materials.wood
    );
  }

  addBox(
    new THREE.Vector3(x, y + 0.15, z),
    new THREE.Vector3(45, 0.3, 5),
    materials.sand
  );

  addBox(
    new THREE.Vector3(x + 12, y + 1.5, z - 10),
    new THREE.Vector3(3, 3, 3),
    materials.wood,
    { userData: { type: "chest", interactable: true } }
  );

  addBox(
    new THREE.Vector3(x - 12, y + 1.5, z - 10),
    new THREE.Vector3(3, 3, 3),
    materials.wood,
    { userData: { type: "crafting_table", interactable: true } }
  );

  for (let i = 0; i < 3; i++) {
    spawnMob(
      "villager",
      new THREE.Vector3(x + random() * 25 - 12, y + 1, z + random() * 25 - 12)
    );
  }

  spawnMob("golem", new THREE.Vector3(x + 8, y + 2, z + 8));
}

function createPortal(x, z, type, index) {
  const y = terrainHeight(x, z) + 5;
  const material = type === "nether"
    ? materials.portalNether
    : materials.portalEnd;

  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.userData = {
    type: "portal",
    portalType: type,
    index,
    active: false
  };

  for (let i = -1; i <= 1; i++) {
    const column = addBox(
      new THREE.Vector3(i * 3, 0, 0),
      new THREE.Vector3(0.8, 10, 0.8),
      materials.obsidian
    );

    group.add(column);
  }

  const portalSurface = addBox(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(6, 8, 0.3),
    material,
    { receiveShadow: false }
  );

  group.add(portalSurface);
  scene.add(group);
  portals.push(group);
}

function createPortals() {
  const locations = [
    [-170, -145],
    [-110, 145],
    [155, -120],
    [178, 90],
    [-25, 170],
    [75, 155],
    [-180, 45],
    [130, 20],
    [-40, -170],
    [40, -145]
  ];

  for (let i = 0; i < 5; i++) {
    createPortal(locations[i][0], locations[i][1], "nether", i + 1);
  }

  for (let i = 5; i < 10; i++) {
    createPortal(locations[i][0], locations[i][1], "end", i - 4);
  }
}

function createCaves() {
  const caveLocations = [
    [-60, -50],
    [100, 115],
    [-145, 85],
    [35, -105],
    [180, -35]
  ];

  for (const [x, z] of caveLocations) {
    const y = terrainHeight(x, z);

    addBox(
      new THREE.Vector3(x, y + 3, z),
      new THREE.Vector3(12, 7, 3),
      materials.stone,
      { userData: { type: "cave_entrance" } }
    );

    addBox(
      new THREE.Vector3(x, y + 1.6, z - 2),
      new THREE.Vector3(6, 3, 3),
      new THREE.MeshLambertMaterial({ color: 0x090909 }),
      { userData: { type: "cave" } }
    );
  }
}

function spawnMob(type, position) {
  const hostile = [
    "zombie",
    "skeleton",
    "creeper",
    "blaze",
    "spider"
  ].includes(type);

  const colors = {
    pig: 0xf09a9a,
    cow: 0x503728,
    sheep: 0xf0f0e8,
    chicken: 0xffffff,
    fish: 0x44b7e8,
    villager: 0x9b704e,
    golem: 0xb8bec5,
    zombie: 0x27934e,
    skeleton: 0xd8d8d8,
    creeper: 0x36bd54,
    blaze: 0xffaa22,
    spider: 0x351d28
  };

  const geometry = type === "spider"
    ? new THREE.SphereGeometry(1.3, 8, 6)
    : new THREE.BoxGeometry(1.8, 2.4, 1.2);

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color: colors[type] || 0xffffff })
  );

  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.userData = {
    type: "mob",
    mobType: type,
    hostile,
    health: type === "golem" ? 100 : 20,
    speed: hostile ? 2.2 : 1.2,
    attackCooldown: 0,
    wanderTimer: random() * 4
  };

  scene.add(mesh);
  mobs.push(mesh);
}

function spawnMobs() {
  const peaceful = ["pig", "cow", "sheep", "chicken", "fish"];
  const dangerous = ["zombie", "skeleton", "creeper", "spider"];

  for (let i = 0; i < 35; i++) {
    const x = random() * 360 - 180;
    const z = random() * 360 - 180;
    const y = terrainHeight(x, z) + 2;

    const type = peaceful[Math.floor(random() * peaceful.length)];
    spawnMob(type, new THREE.Vector3(x, y, z));
  }

  for (let i = 0; i < 22; i++) {
    const x = random() * 360 - 180;
    const z = random() * 360 - 180;
    const y = terrainHeight(x, z) + 2;

    const type = dimension === "nether"
      ? "blaze"
      : dangerous[Math.floor(random() * dangerous.length)];

    spawnMob(type, new THREE.Vector3(x, y, z));
  }
}

function buildWorld() {
  clearWorld();
  createTerrain();
  createCaves();

  if (dimension === "overworld") {
    createVillage(-100, -35);
    createVillage(125, -5);
    createVillage(40, 135);
    createPortals();
    spawnMobs();
  }

  if (dimension === "nether" || dimension === "end") {
    spawnMobs();
  }

  player.position.set(0, terrainHeight(0, 0) + 5, 0);
  player.velocity.set(0, 0, 0);
  updateHUD();
}

function switchDimension(nextDimension) {
  dimension = nextDimension;
  buildWorld();
  showMessage(`Entered the ${dimension.toUpperCase()}`);
}

function getForwardVector() {
  const direction = new THREE.Vector3(0, 0, -1);
  direction.applyEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  return direction.normalize();
}

function mine() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(blocks, false);

  if (!hits.length || hits[0].distance > 10) {
    showMessage("Aim at a mineable block");
    return;
  }

  const target = hits[0].object;

  if (!target.userData.mineable) {
    showMessage("This block cannot be mined");
    return;
  }

  miningTarget = target;
  miningProgress += 0.35;

  if (miningProgress >= 1) {
    const type = target.userData.type;
    inventory[type] = (inventory[type] || 0) + 1;
    scene.remove(target);
    blocks.splice(blocks.indexOf(target), 1);
    miningProgress = 0;
    showMessage(`Collected ${type}`);
    updateHUD();
  }
}

function attack() {
  const now = performance.now();

  if (now - lastAttack < 350) return;
  lastAttack = now;

  const selected = hotbar[selectedSlot];

  if (selected === "bow") {
    if (inventory.arrows <= 0) {
      showMessage("You need arrows");
      return;
    }

    inventory.arrows--;
    shootArrow();
    updateHUD();
    return;
  }

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const hits = raycaster.intersectObjects(mobs, false);

  if (!hits.length || hits[0].distance > 8) {
    showMessage("Nothing to attack");
    return;
  }

  const mob = hits[0].object;
  mob.userData.health -= selected.includes("sword") ? 12 : 5;

  createParticles(mob.position, 0xff3333);

  if (mob.userData.health <= 0) {
    scene.remove(mob);
    mobs.splice(mobs.indexOf(mob), 1);
    showMessage(`${mob.userData.mobType} defeated`);
  } else {
    showMessage(`Hit ${mob.userData.mobType}`);
  }
}

function shootArrow() {
  const arrow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6),
    new THREE.MeshBasicMaterial({ color: 0xf3d39a })
  );

  arrow.rotation.z = Math.PI / 2;
  arrow.position.copy(player.position);

  const direction = getForwardVector();
  arrow.userData = {
    velocity: direction.multiplyScalar(28),
    life: 2
  };

  scene.add(arrow);
  particles.push(arrow);
}

function interact() {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = [...blocks, ...portals];
  const hits = raycaster.intersectObjects(targets, true);

  if (!hits.length || hits[0].distance > 8) {
    showMessage("Nothing nearby");
    return;
  }

  let object = hits[0].object;

  while (object.parent && object.parent !== scene) {
    if (object.parent.userData?.type === "portal") object = object.parent;
    object = object.parent;
  }

  if (object.userData?.type === "portal") {
    const portalType = object.userData.portalType;
    switchDimension(portalType);
    return;
  }

  if (object.userData?.type === "chest") {
    inventory.gold += 2;
    inventory.iron += 3;
    inventory.arrows += 6;
    showMessage("Chest opened: loot collected");
    updateHUD();
    return;
  }

  if (object.userData?.type === "crafting_table") {
    craft();
  }
}

function craft() {
  const recipes = [
    ["wood_pickaxe", "wood", 3],
    ["axe", "wood", 3],
    ["iron_sword", "iron", 2],
    ["bow", "wood", 3],
    ["arrow", "coal", 1],
    ["potion", "gold", 1]
  ];

  const recipe = recipes[Math.floor(Math.random() * recipes.length)];
  const [item, material, cost] = recipe;

  if ((inventory[material] || 0) < cost) {
    showMessage(`Need ${cost} ${material}`);
    return;
  }

  inventory[material] -= cost;
  showMessage(`Crafted ${item}`);
  updateHUD();
}

function updateMobs(delta) {
  for (const mob of [...mobs]) {
    const data = mob.userData;
    data.attackCooldown -= delta;
    data.wanderTimer -= delta;

    const distance = mob.position.distanceTo(player.position);

    if (data.hostile && distance < 35) {
      const direction = player.position.clone().sub(mob.position);
      direction.y = 0;
      direction.normalize();

      if (data.mobType === "creeper") {
        mob.scale.setScalar(
          1 + Math.max(0, Math.sin(performance.now() * 0.015)) * 0.15
        );

        if (distance < 3) {
          player.health -= 22;
          createParticles(mob.position, 0xffaa22);
          mob.position.add(direction.multiplyScalar(-5));
          showMessage("Creeper explosion");
        }
      } else if (data.mobType === "skeleton") {
        if (distance > 12) {
          mob.position.add(direction.multiplyScalar(data.speed * delta));
        }

        if (data.attackCooldown <= 0 && distance < 22) {
          player.health -= 5;
          data.attackCooldown = 2;
          showMessage("A skeleton hit you");
        }
      } else {
        mob.position.add(direction.multiplyScalar(data.speed * delta));

        if (distance < 2.5 && data.attackCooldown <= 0) {
          player.health -= data.mobType === "blaze" ? 8 : 4;
          data.attackCooldown = 1.5;
          showMessage(`${data.mobType} attacked you`);
        }
      }
    } else if (data.wanderTimer <= 0) {
      data.wanderTimer = 2 + random() * 5;
      mob.userData.wanderDirection = new THREE.Vector3(
        random() - 0.5,
        0,
        random() - 0.5
      ).normalize();
    } else if (data.wanderDirection) {
      mob.position.add(
        data.wanderDirection.clone().multiplyScalar(data.speed * delta * 0.3)
      );
    }

    const ground = terrainHeight(mob.position.x, mob.position.z);
    mob.position.y = ground + (data.mobType === "blaze" ? 5 : 1.5);
  }

  if (player.health <= 0 && !player.dead) {
    player.dead = true;
    showMessage("You died. Press R to respawn.");
  }
}

function createParticles(position, color) {
  for (let i = 0; i < 8; i++) {
    const particle = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshBasicMaterial({ color })
    );

    particle.position.copy(position);
    particle.userData = {
      velocity: new THREE.Vector3(
        random() - 0.5,
        random(),
        random() - 0.5
      ).multiplyScalar(5),
      life: 0.7
    };

    scene.add(particle);
    particles.push(particle);
  }
}

function updateParticles(delta) {
  for (const particle of [...particles]) {
    if (!particle.userData.velocity) {
      particle.position.add(particle.userData.velocity || new THREE.Vector3());
      continue;
    }

    particle.position.add(
      particle.userData.velocity.clone().multiplyScalar(delta)
    );

    particle.userData.life -= delta;

    if (particle.userData.life <= 0) {
      scene.remove(particle);
      particles.splice(particles.indexOf(particle), 1);
    }
  }
}

function updateArrows(delta) {
  for (const object of [...particles]) {
    if (!object.userData.velocity) continue;

    object.position.add(object.userData.velocity.clone().multiplyScalar(delta));
    object.userData.life -= delta;

    for (const mob of mobs) {
      if (object.position.distanceTo(mob.position) < 1.5) {
        mob.userData.health -= 10;
        object.userData.life = 0;
      }
    }

    if (object.userData.life <= 0) {
      scene.remove(object);
      particles.splice(particles.indexOf(object), 1);
    }
  }
}

function updatePlayer(delta) {
  if (player.dead) return;

  const movement = new THREE.Vector3();

  if (keys.KeyW) movement.z -= 1;
  if (keys.KeyS) movement.z += 1;
  if (keys.KeyA) movement.x -= 1;
  if (keys.KeyD) movement.x += 1;

  if (movement.length() > 0) {
    movement.normalize();
    movement.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    const sprinting = keys.ShiftLeft && player.stamina > 0;
    const speed = sprinting ? player.speed * 1.7 : player.speed;

    player.velocity.x = movement.x * speed;
    player.velocity.z = movement.z * speed;

    if (sprinting) player.stamina -= delta * 12;
  } else {
    player.velocity.x *= 0.82;
    player.velocity.z *= 0.82;
    player.stamina = Math.min(100, player.stamina + delta * 8);
  }

  if (keys.Space && player.grounded) {
    player.velocity.y = 10;
    player.grounded = false;
  }

  player.velocity.y -= 24 * delta;
  player.position.add(player.velocity.clone().multiplyScalar(delta));

  const ground = terrainHeight(player.position.x, player.position.z) + 2.5;

  if (player.position.y <= ground) {
    player.position.y = ground;
    player.velocity.y = 0;
    player.grounded = true;
  }

  player.position.x = THREE.MathUtils.clamp(
    player.position.x,
    -HALF_WORLD + 5,
    HALF_WORLD - 5
  );

  player.position.z = THREE.MathUtils.clamp(
    player.position.z,
    -HALF_WORLD + 5,
    HALF_WORLD - 5
  );

  camera.position.copy(player.position);
  camera.position.y += 2.5;
  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;

  player.hunger = Math.max(0, player.hunger - delta * 0.03);

  if (player.hunger <= 0) {
    player.health -= delta * 0.8;
  }
}

function updateLighting(delta) {
  timeOfDay += delta * 0.01;
  const daylight = Math.max(0.12, Math.sin(timeOfDay) * 0.5 + 0.5);

  sun.intensity = 0.4 + daylight * 1.8;
  ambientLight.intensity = 0.5 + daylight;

  if (dimension === "nether") {
    scene.background.set(0x3b1111);
    scene.fog.color.set(0x3b1111);
  } else if (dimension === "end") {
    scene.background.set(0x070313);
    scene.fog.color.set(0x070313);
  } else {
    scene.background.set(0x8cc8e8);
    scene.fog.color.set(0x8cc8e8);
  }
}

function createHUD() {
  const hud = document.createElement("div");
  hud.id = "hud";
  hud.style.cssText = `
    position:fixed;
    inset:0;
    pointer-events:none;
    font-family:Arial,sans-serif;
    color:white;
    text-shadow:2px 2px 3px #000;
  `;

  hud.innerHTML = `
    <div id="status" style="position:absolute;top:12px;left:12px;font-size:16px"></div>
    <div id="message" style="position:absolute;top:70px;left:50%;transform:translateX(-50%);font-size:20px"></div>
    <div id="crosshair" style="position:absolute;left:50%;top:50%;font-size:24px">+</div>
    <div id="hotbar" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;gap:5px"></div>
    <div id="touchControls" style="position:absolute;inset:0;display:none;pointer-events:none">
      <div id="joystick" style="position:absolute;left:25px;bottom:35px;width:120px;height:120px;border:2px solid #fff;border-radius:50%;pointer-events:auto"></div>
      <div id="touchButtons" style="position:absolute;right:20px;bottom:25px;display:grid;grid-template-columns:repeat(2,70px);gap:10px;pointer-events:auto"></div>
    </div>
  `;

  document.body.appendChild(hud);

  for (let i = 0; i < hotbar.length; i++) {
    const slot = document.createElement("button");
    slot.textContent = `${i + 1}: ${hotbar[i]}`;
    slot.style.cssText = `
      padding:8px;
      background:${i === 0 ? "#d6a43a
" : "#333b"};
      color:#fff;
      border:1px solid #fff;
      border-radius:5px;
      pointer-events:auto;
      font-size:11px;
    `;

    slot.onclick = () => {
      selectedSlot = i;
      updateHUD();
    };

    document.querySelector("#hotbar").appendChild(slot);
  }

  const touchButtons = document.querySelector("#touchButtons");

  for (const [label, action] of [
    ["Jump", () => keys.Space = true],
    ["Mine", mine],
    ["Attack", attack],
    ["Use", interact],
    ["Craft", craft],
    ["Eat", eatFood]
  ]) {
    const button = document.createElement("button");
    button.textContent = label;
    button.style.cssText = `
      width:70px;
      height:55px;
      font-weight:bold;
      border:2px solid white;
      border-radius:10px;
      background:#222c;
      color:white;
    `;

    button.addEventListener("pointerdown", action);
    button.addEventListener("pointerup", () => keys.Space = false);
    touchButtons.appendChild(button);
  }

  const touch = document.querySelector("#touchControls");
  if (window.matchMedia("(pointer: coarse)").matches) {
    touch.style.display = "block";
  }
}

function updateHUD() {
  const status = document.querySelector("#status");
  const hotbarElement = document.querySelector("#hotbar");

  if (!status || !hotbarElement) return;

  status.innerHTML = `
    ❤️ ${Math.max(0, Math.floor(player.health))}
    🍖 ${Math.floor(player.hunger)}
    ⚡ ${Math.floor(player.stamina)}
    <br>
    World: ${dimension}
    <br>
    Biome: ${biomeAt(player.position.x, player.position.z)}
    <br>
    Position: ${Math.floor(player.position.x)}, ${Math.floor(player.position.z)}
    <br>
    Seed: ${seed}
  `;

  [...hotbarElement.children].forEach((element, index) => {
    element.style.background =
      index === selectedSlot ? "#d6a43a
" : "#333b";
  });
}

let messageTimer;

function showMessage(text) {
  const message = document.querySelector("#message");
  if (!message) return;

  message.textContent = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => {
    message.textContent = "";
  }, 2200);
}

function eatFood() {
  if (inventory.meat > 0) {
    inventory.meat--;
    player.hunger = Math.min(100, player.hunger + 25);
    showMessage("You ate food");
    updateHUD();
  } else {
    showMessage("You have no food");
  }
}

function respawn() {
  player.dead = false;
  player.health = 100;
  player.hunger = 100;
  player.position.set(0, terrainHeight(0, 0) + 5, 0);
  showMessage("You respawned");
}

function setupKeyboard() {
  window.addEventListener("keydown", event => {
    keys[event.code] = true;

    if (event.code === "KeyE") interact();
    if (event.code === "KeyF") mine();
    if (event.code === "KeyQ") attack();
    if (event.code === "KeyC") craft();
    if (event.code === "KeyR" && player.dead) respawn();

    if (/Digit[1-9]/.test(event.code)) {
      selectedSlot = Number(event.code.replace("Digit", "")) - 1;
      updateHUD();
    }
  });

  window.addEventListener("keyup", event => {
    keys[event.code] = false;
  });

  renderer.domElement.addEventListener("mousedown", event => {
    if (event.button === 0) attack();
    if (event.button === 2) interact();
  });

  renderer.domElement.addEventListener("contextmenu", event => {
    event.preventDefault();
  });

  let dragging = false;
  let previousX = 0;
  let previousY = 0;

  renderer.domElement.addEventListener("pointerdown", event => {
    dragging = true;
    previousX = event.clientX;
    previousY = event.clientY;
  });

  renderer.domElement.addEventListener("pointerup", () => {
    dragging = false;
  });

  renderer.domElement.addEventListener("pointermove", event => {
    if (!dragging) return;

    const dx = event.clientX - previousX;
    const dy = event.clientY - previousY;

    yaw -= dx * 0.006;
    pitch -= dy * 0.006;
    pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);

    previousX = event.clientX;
    previousY = event.clientY;
  });
}

function setupTouchJoystick() {
  const joystick = document.querySelector("#joystick");
  if (!joystick) return;

  let active = false;

  joystick.addEventListener("pointerdown", event => {
    active = true;
    joystick.setPointerCapture(event.pointerId);
  });

  joystick.addEventListener("pointermove", event => {
    if (!active) return;

    const rect = joystick.getBoundingClientRect();
    const x = (event.clientX - (rect.left + rect.width / 2)) / 45;
    const y = (event.clientY - (rect.top + rect.height / 2)) / 45;

    keys.KeyA = x < -0.25;
    keys.KeyD = x > 0.25;
    keys.KeyW = y < -0.25;
    keys.KeyS = y > 0.25;
  });

  joystick.addEventListener("pointerup", () => {
    active = false;
    keys.KeyA = false;
    keys.KeyD = false;
    keys.KeyW = false;
    keys.KeyS = false;
  });
}

function saveGame() {
  localStorage.setItem(
    "survivalGameSave",
    JSON.stringify({
      seed,
      dimension,
      player: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
        health: player.health,
        hunger: player.hunger
      },
      inventory
    })
  );

  showMessage("Game saved");
}

function loadGame() {
  const saved = localStorage.getItem("survivalGameSave");
  if (!saved) return;

  const data = JSON.parse(saved);
  seed = data.seed;
  dimension = data.dimension;
  random = mulberry32(seed);

  player.position.set(
    data.player.x,
    data.player.y,
    data.player.z
  );

  player.health = data.player.health;
  player.hunger = data.player.hunger;
  Object.assign(inventory, data.inventory);

  buildWorld();
  showMessage("Game loaded");
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  updatePlayer(delta);
  updateMobs(delta);
  updateParticles(delta);
  updateArrows(delta);
  updateLighting(delta);
  updateHUD();

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("beforeunload", saveGame);

createHUD();
setupKeyboard();
setupTouchJoystick();
loadGame();

if (!localStorage.getItem("survivalGameSave")) {
  buildWorld();
}

showMessage("WASD to move • E to use • F to mine • Q to attack • C to craft");
animate();
