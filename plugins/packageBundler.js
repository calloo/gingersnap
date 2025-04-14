import fs from "fs";
import path from "path";

/**
 * bundles package.json file
 * @param {({name: string; version: string; description?: string; dependencies: Array<{[string: string]: any}>, author?: string; main?: string;modules: Object})} packageDetails
 * @returns {{generateBundle(*, *, *): void, name: string}}
 */
export default function packageBundler(packageDetails) {
  return {
    name: "packageBundler",

    generateBundle(outputOptions, _bundle, isWrite) {
      if (isWrite) {
        const outpuDir = outputOptions.dir ?? path.dirname(outputOptions.file);

        if (!fs.existsSync(outpuDir)) {
          fs.mkdirSync(outpuDir);
        }
        fs.writeFileSync(
          path.join(outpuDir, "package.json"),
          JSON.stringify({
            name: packageDetails.name,
            version: packageDetails.version,
            description: packageDetails.description,
            dependencies: packageDetails.dependencies,
            author: packageDetails.author,
            main: packageDetails.main,
            exports: Object.fromEntries(
              Object.entries(packageDetails.modules).map(([mod, path]) => {
                const typesPath = path.endsWith("index.ts") ? `./${mod}/index.d.ts` : `./${mod}.d.ts`;
                return [
                  `./${mod}`,
                  {
                    import: { types: typesPath, default: `./${mod}.mjs` },
                    require: { types: typesPath, default: `./${mod}.cjs` },
                  },
                ];
              })
            ),
          })
        );
      }
    },
  };
}
