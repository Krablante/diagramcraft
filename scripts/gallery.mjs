// Renders the README gallery into docs/gallery. Run after visual changes:
// npm run gallery
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "../src/index.js";
import { listThemes } from "../src/themes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "gallery");
mkdirSync(outDir, { recursive: true });

const readSpec = (file) => JSON.parse(readFileSync(join(root, "examples", file), "utf8"));

/** @type {Array<{name:string, spec:any, theme?:string, scale?:number}>} */
const jobs = [];
for (const theme of listThemes()) {
  jobs.push({ name: `theme-${theme.id}`, spec: readSpec("quickstart.json"), theme: theme.id, scale: 1 });
}
jobs.push(
  { name: "buro-draft-workflow", spec: readSpec("buro-draft-workflow.json"), theme: "paper", scale: 1 },
  { name: "opencodez-release", spec: readSpec("opencodez-release.json"), theme: "vivid", scale: 1 },
  { name: "transformer-block", spec: readSpec("transformer-block.json"), theme: "glass", scale: 1 },
  { name: "opencodebot-artifact", spec: readSpec("opencodebot-artifact.json"), theme: "blueprint", scale: 1 },
  { name: "node-shapes", spec: readSpec("node-shapes.json"), theme: "classic", scale: 1 },
);

for (const job of jobs) {
  const result = await render(job.spec, { theme: job.theme, formats: ["png"], scale: job.scale });
  const file = join(outDir, `${job.name}.png`);
  writeFileSync(file, result.png);
  console.log(`${file}  ${(result.png.length / 1024).toFixed(0)} KB`);
}
