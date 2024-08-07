import * as path from "path";
import { code, Code, imp, Import, joinCode } from "ts-poet";
import {
  CodeGeneratorRequest,
  FieldDescriptorProto,
  FileDescriptorProto,
  MethodDescriptorProto,
  MethodOptions,
} from "ts-proto-descriptors";
import ReadStream = NodeJS.ReadStream;
import { SourceDescription } from "./sourceInfo";
import { camelCase as camelCaseAnything } from "case-anything";

type PackageTree = {
  index: string;
  chunks: Code[];
  leaves: { [k: string]: PackageTree };
};
export function generateIndexFiles(files: FileDescriptorProto[]): [string, Code][] {
  const packageTree: PackageTree = {
    index: "index.ts",
    leaves: {},
    chunks: [],
  };
  for (const { name, package: pkg } of files) {
    const moduleName = name.replace(".proto", ".pb");
    const pkgParts = pkg.length > 0 ? pkg.split(".") : [];

    const branch = pkgParts.reduce<PackageTree>((branch, part, i): PackageTree => {
      if (!(part in branch.leaves)) {
        const prePkgParts = pkgParts.slice(0, i + 1);
        const index = `index.${prePkgParts.join(".")}.ts`;
        branch.chunks.push(code`export * as ${part} from "./${path.basename(index, ".ts")}";`);
        branch.leaves[part] = {
          index,
          leaves: {},
          chunks: [],
        };
      }
      return branch.leaves[part];
    }, packageTree);
    branch.chunks.push(code`export * from "./${moduleName}";`);
  }

  const indexFiles: [string, Code][] = [];
  let branches: PackageTree[] = [packageTree];
  let currentBranch;
  while ((currentBranch = branches.pop())) {
    indexFiles.push([currentBranch.index, joinCode(currentBranch.chunks)]);
    branches.push(...Object.values(currentBranch.leaves));
  }

  return indexFiles;
}

export function readToBuffer(stream: ReadStream): Promise<Buffer> {
  return new Promise((resolve) => {
    const ret: Array<Buffer | string> = [];
    let len = 0;
    stream.on("readable", () => {
      let chunk;
      while ((chunk = stream.read())) {
        ret.push(chunk);
        len += chunk.length;
      }
    });
    stream.on("end", () => {
      resolve(Buffer.concat(ret as any, len));
    });
  });
}

export function fail(message: string): never {
  throw new Error(message);
}

export function singular(name: string): string {
  return name.substring(0, name.length - 1); // drop the 's', which is extremely naive
}

export function lowerFirst(name: string): string {
  return name.substring(0, 1).toLowerCase() + name.substring(1);
}

export function upperFirst(name: string): string {
  return name.substring(0, 1).toUpperCase() + name.substring(1);
}

// Since we don't know what form the comment originally took, it may contain closing block comments.
const CloseComment = /\*\//g;

/** Removes potentially harmful characters from comments and pushes it into chunks. */
export function addComment(
  desc: Partial<Pick<SourceDescription, "leadingComments" | "trailingComments">>,
  chunks: Code[],
  deprecated?: boolean,
  prefix: string = "",
): void {
  let lines: string[] = [];
  if (desc.leadingComments || desc.trailingComments) {
    let content = (desc.leadingComments || desc.trailingComments || "").replace(CloseComment, "* /").trim();

    // Detect /** ... */ comments
    const isDoubleStar = content.startsWith("*");
    if (isDoubleStar) {
      content = content.substring(1).trim();
    }

    // Prefix things like the enum name.
    if (prefix) {
      content = prefix + content;
    }

    lines = content.split("\n").map((l) => l.replace(/^ /, "").replace(/\n/, ""));
  }
  // Deprecated comment should be added even if no other comment was added
  if (deprecated) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("@deprecated");
  }

  let comment: Code;
  if (lines.length === 1) {
    comment = code`/** ${lines[0]} */`;
  } else {
    comment = code`/**\n * ${lines.join("\n * ")}\n */`;
  }
  if (lines.length > 0) {
    chunks.push(code`\n\n${comment}\n\n`);
  }
}

export function maybePrefixPackage(fileDesc: FileDescriptorProto, rest: string): string {
  const prefix = fileDesc.package === "" ? "" : `${fileDesc.package}.`;
  return `${prefix}${rest}`;
}

/**
 * Asserts that an object is an instance of a certain class
 * @param obj The object to check
 * @param constructor The constructor of the class to check
 */
export function assertInstanceOf<T>(obj: unknown, constructor: { new (...args: any[]): T }): asserts obj is T {
  if (!(obj instanceof constructor)) {
    throw new Error(`Expected instance of ${constructor.name}`);
  }
}

/**
 * A MethodDescriptorProto subclass that adds formatted properties
 */
export class FormattedMethodDescriptor implements MethodDescriptorProto {
  public name: string;
  public inputType: string;
  public outputType: string;
  public options: MethodOptions | undefined;
  public clientStreaming: boolean;
  public serverStreaming: boolean;

  readonly original: MethodDescriptorProto;
  /**
   * The name of this method with formatting applied according to the `Options` object passed to the constructor.
   * Automatically updates to any changes to the `Options` or `name` of this object
   */
  public get formattedName() {
    return camelCaseAnything(this.name);
  }

  constructor(src: MethodDescriptorProto) {
    this.original = src;
    this.name = src.name;
    this.inputType = src.inputType;
    this.outputType = src.outputType;
    this.options = src.options;
    this.clientStreaming = src.clientStreaming;
    this.serverStreaming = src.serverStreaming;
  }

  /**
   * Retrieve the source `MethodDescriptorProto` used to construct this object
   * @returns The source `MethodDescriptorProto` used to construct this object
   */
  public getSource(): MethodDescriptorProto {
    return this.original;
  }
}

export function getFieldJsonName(
  field: Pick<FieldDescriptorProto, "name" | "jsonName">,
): string {
  return field.jsonName;
}

export function getFieldName(
  field: Pick<FieldDescriptorProto, "name" | "jsonName">,
): string {
  return field.jsonName;
}

/**
 * https://github.com/eslint-community/eslint-plugin-security/blob/main/docs/the-dangers-of-square-bracket-notation.md
 */
function isValidIdentifier(propertyName: string): boolean {
  return /^[a-zA-Z_$][\w$]*$/.test(propertyName);
}

/** Returns `bar` or `"bar"` if `propertyName` isn't a safe property name. */
export function safeAccessor(propertyName: string): string {
  return isValidIdentifier(propertyName) ? propertyName : JSON.stringify(propertyName);
}

/**
 * Returns a snippet for reading an object's property, such as `foo.bar`, or `foo['bar']` if the property name contains unusual characters.
 * For simplicity, we don't match the ECMA 5/6 rules for valid identifiers exactly, and return array syntax liberally.
 * @param objectName
 * @param propertyName
 * @param optional
 */
export function getPropertyAccessor(objectName: string, propertyName: string, optional: boolean = false): string {
  return isValidIdentifier(propertyName)
    ? `${objectName}${optional ? "?" : ""}.${propertyName}`
    : `${objectName}${optional ? "?." : ""}[${safeAccessor(propertyName)}]`;
}

export function impFile(spec: string) {
  return imp(`${spec}`);
}

export function impProto(module: string, type: string): Import {
  const prefix = "";
  return imp(`${prefix}${type}@./${module}.pb}`);
}

// Could be useful should we want to use an arrow function
// export function arrowFunction(params: string, body: Code | string, isOneLine: boolean = true): Code {
//   if (isOneLine) {
//     return code`(${params}) => ${body}`;
//   }
//   return code`(${params}) => { ${body} }`;
// }

export async function getVersions(request: CodeGeneratorRequest) {
  let protocVersion = "unknown";
  if (request.compilerVersion) {
    const { major, minor, patch } = request.compilerVersion;
    protocVersion = `v${major}.${minor}.${patch}`;
  }

  const path: string = "../package.json";
  const packageJson = await import(path);
  const tsProtoVersion = `v${packageJson?.version ?? "unknown"}`;

  return {
    protocVersion,
    tsProtoVersion,
  };
}
