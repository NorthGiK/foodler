const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const token = process.env.TRACER_PLUGIN_TOKEN;
const versionName = process.env.TRACER_VERSION_NAME;
const versionCode = process.env.TRACER_VERSION_CODE;
const sourceMapsDirectory = process.argv[2];
if (!token || !versionName || !sourceMapsDirectory) {
  throw new Error(
    "TRACER_PLUGIN_TOKEN, TRACER_VERSION_NAME and a source-map directory are required",
  );
}
if (!fs.statSync(sourceMapsDirectory).isDirectory()) {
  throw new Error("The source-map path must be a directory");
}

const archive = path.join(os.tmpdir(), `foodler-sourcemaps-${process.pid}.zip`);
const zipped = spawnSync("zip", ["-9", "-r", archive, ".", "-i", "*.map"], {
  cwd: sourceMapsDirectory,
  stdio: "inherit",
});
if (zipped.status !== 0)
  throw new Error("Could not archive Tracer source maps");

const form = new FormData();
form.set("sourcemapToken", token);
form.set("versionName", versionName);
if (versionCode) form.set("versionCode", versionCode);
form.set(
  "file",
  new Blob([fs.readFileSync(archive)], { type: "application/zip" }),
  "sourcemaps.zip",
);

fetch("https://plugin-api.apptracer.ru/api/sourcemap/upload", {
  method: "POST",
  body: form,
})
  .then((response) => {
    if (!response.ok)
      throw new Error(`Tracer source-map upload failed: ${response.status}`);
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => fs.rmSync(archive, { force: true }));
