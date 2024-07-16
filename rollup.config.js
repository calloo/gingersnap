import typescript from "@rollup/plugin-typescript";
import packageBundler from "./plugins/packageBundler.js";
import fs from "fs";
import dts from "rollup-plugin-dts";
import del from "rollup-plugin-delete";

const { name, author, description, dependencies, version } = JSON.parse(fs.readFileSync("./package.json").toString());

export default (options) => {
  const config = {
    input: {
      synchronize: "./src/synchronize.ts",
      mocks: "./src/mocks.ts",
      socket: "./src/socket.ts",
      typing: "./src/typing/types.ts",
      stream: "./src/stream/index.ts",
      "reflection/injector": "./src/reflection/injector.ts",
      "stream/call": "./src/stream/call.ts",
      "stream/state": "./src/stream/state.ts",
      "stream/collector": "./src/stream/collector.ts",
      "stream/observable": "./src/stream/observable.ts",
      networking: "./src/networking/index.ts",
      managers: "./src/managers/index.ts",
      future: "./src/future/index.ts",
      errors: "./src/errors/index.ts",
      "data-structures/array": "./src/data-structures/array/index.ts",
      "data-structures/object": "./src/data-structures/object/index.ts",
      "data/decoders": "./src/data/decoders/index.ts",
      "data/model": "./src/data/model/index.ts",
      "data/bus": "./src/data/bus.ts",
    },
    output: [
      {
        dir: "./lib",
        format: "es",
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].mjs",
      },
      {
        dir: "./lib",
        format: "cjs",
        preserveModules: true,
        preserveModulesRoot: "src",
        entryFileNames: "[name].cjs",
      },
    ],
  };

  return [
    {
      ...config,
      plugins: [
        packageBundler({
          name,
          author,
          description,
          dependencies,
          version: options?.releaseVersion ?? version,
          modules: Object.keys(config.input),
        }),
        typescript({ tsconfig: "./tsconfig.json" }),
      ],
    },
    {
      ...config,
      input: Object.fromEntries(
        Object.entries(config.input).map(([key, value]) => [
          key,
          value.replace(".ts", ".d.ts").replace("./src", "./lib/dts"),
        ])
      ),
      output: [
        {
          dir: "./lib",
          format: "es",
        },
      ],
      plugins: [dts(), del({ targets: "lib/dts", hook: "buildEnd" })],
    },
  ];
};
