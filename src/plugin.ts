import {
  CodeGeneratorRequest,
  CodeGeneratorResponse,
  CodeGeneratorResponse_Feature,
  FileDescriptorProto,
} from "ts-proto-descriptors";
import { promisify } from "util";
import { getVersions, readToBuffer } from "./utils";
import { generateFile, makeUtils } from "./main";
import { createTypeMap } from "./types";
import { BaseContext } from "./context";
import { getTsPoetOpts, optionsFromParameter } from "./options";
import { generateTypeRegistry } from "./generate-type-registry";

// this would be the plugin called by the protoc compiler
async function main() {
  const stdin = await readToBuffer(process.stdin);
  const request = CodeGeneratorRequest.decode(stdin);

  const { protocVersion, tsProtoVersion } = await getVersions(request);

  const options = optionsFromParameter(request.parameter);
  const typeMap = createTypeMap(request, options);
  const utils = makeUtils(options);
  const ctx: BaseContext = { typeMap, options, utils };

  let filesToGenerate: FileDescriptorProto[];

  const fileSet = new Set();
  function addFilesUnlessAliased(filenames: string[]) {
    filenames.forEach((name) => {
      if (fileSet.has(name)) return;
      fileSet.add(name);
      const file = request.protoFile.find((file) => file.name === name);
      if (file && file.dependency.length > 0) {
        addFilesUnlessAliased(file.dependency);
      }
    });
  }
  addFilesUnlessAliased(request.fileToGenerate);
  filesToGenerate = request.protoFile.filter((file) => fileSet.has(file.name));

  const files = await Promise.all(
    filesToGenerate.map(async (file) => {
      if (file.syntax !== "proto3") {
        throw Error("Only proto3 files are supported");
      }
      const [path, code] = generateFile({ ...ctx }, file);
      const content = code.toString({ ...getTsPoetOpts(options, tsProtoVersion, protocVersion, file.name), path });
      return { name: path, content };
    }),
  );

  const path = "typeRegistry.ts";
  const code = generateTypeRegistry(ctx);

  const content = code.toString({ ...getTsPoetOpts(options, tsProtoVersion, protocVersion), path });
  files.push({ name: path, content });

  const response = CodeGeneratorResponse.fromPartial({
    file: files,
    supportedFeatures: CodeGeneratorResponse_Feature.FEATURE_PROTO3_OPTIONAL,
  });
  const buffer = CodeGeneratorResponse.encode(response).finish();
  const write = promisify(process.stdout.write as (buffer: Buffer) => boolean).bind(process.stdout);
  await write(Buffer.from(buffer));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((e) => {
    process.stderr.write("FAILED!");
    process.stderr.write(e.message);
    process.stderr.write(e.stack);
    process.exit(1);
  });
