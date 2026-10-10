import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(packageRoot, "codegen/ws-outbound.compile.ts");
const runtimeSchemaMetadata = resolve(packageRoot, "src/validation/ws-outbound-schema-metadata.ts");
const output = resolve(packageRoot, "src/generated/validation/ws-outbound.aot.ts");

const require = createRequire(import.meta.url);
const zodAotEntry = require.resolve("zod-aot");
const zodAotRoot = resolve(dirname(zodAotEntry), "..");
const emitterPath = resolve(zodAotRoot, "dist/cli/emitter.js");
const discriminatedUnionPath = resolve(
  zodAotRoot,
  "dist/core/codegen/schemas/discriminated-union.js",
);

async function ensureZodAotRuntimeImportExtensionPatch() {
  const emitter = await readFile(emitterPath, "utf8");
  if (emitter.includes('sourceRelPath.endsWith(".js")')) {
    return;
  }

  const before = 'let importPath = sourceRelPath.replace(/\\.[cm]?[jt]sx?$/, "");';
  const after =
    'let importPath = sourceRelPath.endsWith(".js")\n        ? sourceRelPath\n        : sourceRelPath.replace(/\\.[cm]?[jt]sx?$/, "");';
  if (!emitter.includes(before)) {
    throw new Error("zod-aot emitter shape changed; update the runtime import extension patch");
  }
  await writeFile(emitterPath, emitter.replace(before, after));
}

async function ensureZodAotDiscriminatedUnionOutputPatch() {
  let discriminatedUnionEmitter = await readFile(discriminatedUnionPath, "utf8");
  if (
    discriminatedUnionEmitter.includes(
      "const needsOutputPropagation = ir.options.some(hasMutation);",
    )
  ) {
    return;
  }

  const importBefore = 'import { escapeString } from "../context.js";';
  const importAfter = 'import { escapeString, hasMutation } from "../context.js";';
  const outputFlagBefore = "const discKey = escapeString(ir.discriminator);\n    let code = emit `";
  const outputFlagAfter =
    "const discKey = escapeString(ir.discriminator);\n    const needsOutputPropagation = ir.options.some(hasMutation);\n    let code = emit `";
  const propagationBefore =
    "        ${g.visit(option, { input: objVar, output: objVar })}\n        break;`;";
  const propagationAfter =
    '        ${g.visit(option, { input: objVar, output: objVar })}\n        ${needsOutputPropagation ? `${g.output}=${objVar};` : ""}\n        break;`;';

  if (
    !discriminatedUnionEmitter.includes(importBefore) ||
    !discriminatedUnionEmitter.includes(outputFlagBefore) ||
    !discriminatedUnionEmitter.includes(propagationBefore)
  ) {
    throw new Error("zod-aot discriminated-union emitter shape changed; update the output patch");
  }

  discriminatedUnionEmitter = discriminatedUnionEmitter
    .replace(importBefore, importAfter)
    .replace(outputFlagBefore, outputFlagAfter)
    .replace(propagationBefore, propagationAfter);
  await writeFile(discriminatedUnionPath, discriminatedUnionEmitter);
}

async function ensureZodAotRegexFlagsPatch() {
  const patches = [
    {
      file: "core/extract/checks.js",
      before: "...(pattern ? { pattern } : {})",
      after:
        '...(pattern ? { pattern, flags: def.pattern instanceof RegExp ? def.pattern.flags : "" } : {})',
    },
    {
      file: "core/extract/extractors/string.js",
      before: "...(pattern ? { pattern } : {})",
      after:
        '...(pattern ? { pattern, flags: def.pattern instanceof RegExp ? def.pattern.flags : "" } : {})',
    },
    {
      file: "core/codegen/fast-path.js",
      before: "regex: (prefix, pattern) => emitRegex(ctx, prefix, pattern)",
      after: "regex: (prefix, pattern, flags) => emitRegex(ctx, prefix, pattern, flags)",
    },
    {
      file: "core/codegen/slow-path.js",
      before: "regex: (prefix, pattern) => emitRegex(ctx, prefix, pattern)",
      after: "regex: (prefix, pattern, flags) => emitRegex(ctx, prefix, pattern, flags)",
    },
    {
      file: "core/codegen/context.js",
      before:
        'export function emitRegex(ctx, prefix, pattern) {\n    if (ctx.mode === "lean") {\n        const wellKnown = lookupWellKnownRegex(pattern);\n        if (wellKnown !== null) {\n            ctx.usedHelpers.add(wellKnown);\n            return wellKnown;\n        }\n    }\n    const cached = ctx.regexCache.get(pattern);\n    if (cached)\n        return cached;\n    const name = `__re_${prefix}_${ctx.counter++}`;\n    ctx.preamble.push(`var ${name}=new RegExp(${escapeString(pattern)});`);\n    ctx.regexCache.set(pattern, name);\n    return name;\n}',
      after:
        'export function emitRegex(ctx, prefix, pattern, flags = "") {\n    if (ctx.mode === "lean" && !flags) {\n        const wellKnown = lookupWellKnownRegex(pattern);\n        if (wellKnown !== null) {\n            ctx.usedHelpers.add(wellKnown);\n            return wellKnown;\n        }\n    }\n    const cacheKey = JSON.stringify([pattern, flags]);\n    const cached = ctx.regexCache.get(cacheKey);\n    if (cached) return cached;\n    const name = `__re_${prefix}_${ctx.counter++}`;\n    ctx.preamble.push(`var ${name}=new RegExp(${escapeString(pattern)},${escapeString(flags)});`);\n    const reference = /[gy]/.test(flags) ? `(${name}.lastIndex=0,${name})` : name;\n    ctx.regexCache.set(cacheKey, reference);\n    return reference;\n}',
    },
    {
      file: "core/codegen/schemas/string.js",
      before: 'g.regex("email", EMAIL_REGEX_SOURCE)',
      after: 'g.regex("email", check.pattern ?? EMAIL_REGEX_SOURCE, check.flags)',
    },
    {
      file: "core/codegen/schemas/string.js",
      before: 'g.regex("str", check.pattern)',
      after: 'g.regex("str", check.pattern, check.flags)',
    },
    {
      file: "core/codegen/schemas/string.js",
      before: 'g.regex("re", check.pattern)',
      after: 'g.regex("re", check.pattern, check.flags)',
    },
    {
      file: "core/codegen/schemas/string.js",
      before: 'g.regex("uuid", check.pattern ?? UUID_REGEX_SOURCE)',
      after: 'g.regex("uuid", check.pattern ?? UUID_REGEX_SOURCE, check.flags)',
    },
    {
      file: "core/codegen/schemas/string.js",
      before: 'g.regex("uuid", pat)',
      after: 'g.regex("uuid", pat, check.flags)',
    },
  ];
  const pending = new Map();
  for (const patch of patches) {
    const file = resolve(zodAotRoot, "dist", patch.file);
    const compilerSource = pending.get(file) ?? (await readFile(file, "utf8"));
    if (compilerSource.includes(patch.after)) continue;
    if (!compilerSource.includes(patch.before))
      throw new Error(`zod-aot regex emitter changed: ${patch.file}`);
    pending.set(file, compilerSource.replaceAll(patch.before, patch.after));
  }
  for (const [file, compilerSource] of pending) await writeFile(file, compilerSource);
}

await Promise.all([
  ensureZodAotRuntimeImportExtensionPatch(),
  ensureZodAotDiscriminatedUnionOutputPatch(),
  ensureZodAotRegexFlagsPatch(),
]);

const [{ discoverSchemas }, { compileSchemas }, { generateCompiledFileContent }] =
  await Promise.all([
    import(pathToFileURL(resolve(zodAotRoot, "dist/discovery.js")).href),
    import(pathToFileURL(resolve(zodAotRoot, "dist/core/pipeline.js")).href),
    import(pathToFileURL(resolve(zodAotRoot, "dist/cli/emitter.js")).href),
  ]);

const schemas = await discoverSchemas(source, { cacheBust: true });
if (schemas.length === 0) {
  throw new Error(`No zod-aot compile() exports found in ${relative(packageRoot, source)}`);
}

const compiled = compileSchemas(schemas, { mode: "inline" });
const runtimeImportPath = relative(dirname(output), runtimeSchemaMetadata)
  .replace(/\.[cm]?[jt]sx?$/, ".js")
  .split(sep)
  .join("/");
const content = generateCompiledFileContent(compiled, runtimeImportPath, {
  zodCompat: false,
}).replace(
  "// AUTO-GENERATED by zod-aot — DO NOT EDIT",
  "// @ts-nocheck\n// AUTO-GENERATED by zod-aot — DO NOT EDIT",
);

await mkdir(dirname(output), { recursive: true });
await writeFile(output, content);

console.info(
  `generated ${relative(packageRoot, output)} from ${relative(packageRoot, source)} (${schemas
    .map((schema) => schema.exportName)
    .join(", ")})`,
);
