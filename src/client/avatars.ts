export function trumpHead(size = 64): string {
  return `<img class="hero-photo trump" src="/trump.jpg" width="${size}" height="${size}" alt="" draggable="false">`;
}

export function bidenHead(size = 64): string {
  return `<img class="hero-photo biden" src="/biden.jpg" width="${size}" height="${size}" alt="" draggable="false">`;
}

export function headFor(faction: "trump" | "biden", size = 64): string {
  return faction === "trump" ? trumpHead(size) : bidenHead(size);
}
