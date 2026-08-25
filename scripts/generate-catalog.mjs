#!/usr/bin/env node
/**
 * Génère data/videos.js à partir du contenu du dossier videos/.
 *
 *   node scripts/generate-catalog.mjs
 *
 * - Un sous-dossier de videos/ devient une catégorie.
 * - Une image posters/<nom-du-fichier>.(jpg|png|webp) devient la miniature.
 * - La durée est extraite avec ffprobe s'il est installé (sinon lue par le
 *   navigateur au premier affichage).
 * - Les champs édités à la main (titre, description, tags, date, source) sont
 *   conservés d'une génération à l'autre : on ne réécrit que ce qui est déduit
 *   du fichier.
 */

import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIDEO_DIR = path.join(ROOT, "videos");
const OUTPUT = path.join(ROOT, "data", "videos.js");

const VIDEO_EXT = new Set([".mp4", ".webm", ".ogv", ".ogg", ".m4v", ".mov"]);
const POSTER_EXT = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

function slug(s) {
  return s.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromFile(name) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Parcourt videos/ récursivement ; le premier niveau de dossier = catégorie. */
async function walk(dir, category = "") {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "fr"))) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...await walk(full, category || entry.name));
    } else if (VIDEO_EXT.has(path.extname(entry.name).toLowerCase())) {
      found.push({ full, category });
    }
  }
  return found;
}

function findPoster(fileBase) {
  for (const ext of POSTER_EXT) {
    const rel = path.join("posters", fileBase + ext);
    if (existsSync(path.join(ROOT, rel))) return rel.split(path.sep).join("/");
  }
  return "";
}

async function probeDuration(file) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file
    ]);
    const value = Number.parseFloat(stdout.trim());
    return Number.isFinite(value) ? Math.round(value) : null;
  } catch {
    return null; // ffprobe absent ou format illisible
  }
}

/** Relit le catalogue existant pour conserver les métadonnées saisies à la main. */
async function loadExisting() {
  const previous = new Map();
  try {
    const source = await readFile(OUTPUT, "utf8");
    const json = source.slice(source.indexOf("["), source.lastIndexOf("]") + 1);
    for (const item of JSON.parse(json)) {
      if (item && item.src) previous.set(item.src, item);
    }
  } catch {
    // Pas encore de catalogue, ou catalogue illisible : on repart de zéro.
  }
  return previous;
}

async function main() {
  if (!existsSync(VIDEO_DIR)) {
    console.error(`Dossier introuvable : ${VIDEO_DIR}`);
    process.exit(1);
  }

  const previous = await loadExisting();
  const files = await walk(VIDEO_DIR);
  const hasFfprobe = await probeDuration(files[0]?.full ?? "") !== null;

  const catalog = [];
  for (const { full, category } of files) {
    const rel = path.relative(ROOT, full).split(path.sep).join("/");
    const src = rel.split("/").map(encodeURIComponent).join("/");
    const name = path.basename(full);
    const info = await stat(full);
    const old = previous.get(src) ?? {};

    const entry = {
      id: old.id || slug(rel.replace(/\.[^.]+$/, "")),
      title: old.title || titleFromFile(name),
      description: old.description || "",
      category: old.category || category || "Non classé",
      tags: old.tags || [],
      src,
      poster: old.poster || findPoster(path.basename(name, path.extname(name))),
      duration: old.duration ?? (hasFfprobe ? await probeDuration(full) : null),
      size: info.size,
      date: old.date || info.mtime.toISOString().slice(0, 10),
      source: old.source || ""
    };

    catalog.push(entry);
  }

  const header = [
    "/* Catalogue des vidéos — généré par scripts/generate-catalog.mjs.",
    " *",
    " * Vous pouvez éditer à la main les champs title, description, category,",
    " * tags, date, source et poster : ils sont conservés lors des régénérations.",
    " * Les champs src, size et duration sont déduits des fichiers.",
    " */",
    "window.VIDEO_CATALOG = "
  ].join("\n");

  await writeFile(OUTPUT, header + JSON.stringify(catalog, null, 2) + ";\n", "utf8");

  console.log(`${catalog.length} vidéo(s) répertoriée(s) → ${path.relative(ROOT, OUTPUT)}`);
  if (!hasFfprobe && catalog.length) {
    console.log("ffprobe introuvable : les durées seront lues par le navigateur.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
