#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const skipped = new Set([".git", ".github", "delete_later", "scripts", "_site"]);
const pages = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith(".html")) pages.push(file);
  }
}

walk(root);

for (const file of pages) {
  const upward = path.relative(path.dirname(file), root).split(path.sep).join("/");
  const prefix = upward ? `${upward}/` : "";
  let source = fs.readFileSync(file, "utf8");

  source = source.replace(
    /\b(href|src|action|poster)=(["'])\/([^/"'][^"']*|)\2/g,
    (_match, attribute, quote, target) =>
      `${attribute}=${quote}${target ? prefix + target : prefix || "./"}${quote}`,
  );

  if (!/rel=["']manifest["']/.test(source)) {
    const tags = `<link rel="manifest" href="${prefix}manifest.json">\n<meta name="theme-color" content="#b32025">`;
    source = source.replace(/(<meta name="viewport"[^>]*>)/i, `$1\n${tags}`);
  }

  fs.writeFileSync(file, source);
}

console.log(`Rewrote ${pages.length} pages with repository-safe relative paths.`);
