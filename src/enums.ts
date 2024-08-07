import { code, def, Code, joinCode } from "ts-poet";
import { EnumDescriptorProto, EnumValueDescriptorProto } from "ts-proto-descriptors";
import { addComment } from "./utils";
import { uncapitalize } from "./case";
import SourceInfo, { Fields } from "./sourceInfo";
import { Context } from "./context";

// Output the `enum { Foo, A = 0, B = 1 }`
export function generateEnum(
  ctx: Context,
  fullName: string,
  enumDesc: EnumDescriptorProto,
  sourceInfo: SourceInfo,
): Code {
  const chunks: Code[] = [];

  addComment(sourceInfo, chunks, enumDesc.options?.deprecated);

  chunks.push(code`export enum ${def(fullName)} {`);

  const delimiter = "=";

  enumDesc.value.forEach((valueDesc, index) => {
    const info = sourceInfo.lookup(Fields.enum.value, index);
    const memberName = getMemberName(ctx, enumDesc, valueDesc);
    addComment(info, chunks, valueDesc.options?.deprecated, `${memberName} - `);
    chunks.push(code`${memberName} ${delimiter} ${valueDesc.number.toString()},`);
  });
  
  chunks.push(code`}`);

  chunks.push(code`\n`);
  chunks.push(generateEnumFromJson(ctx, fullName, enumDesc));
  chunks.push(code`\n`);
  chunks.push(generateEnumToJson(ctx, fullName, enumDesc));
  return joinCode(chunks, { on: "\n" });
}

/** Generates a function with a big switch statement to decode JSON -> our enum. */
export function generateEnumFromJson(
  ctx: Context,
  fullName: string,
  enumDesc: EnumDescriptorProto,
): Code {
  const { utils } = ctx;
  const chunks: Code[] = [];

  const functionName = uncapitalize(fullName) + "FromJSON";
  chunks.push(code`export function ${def(functionName)}(object: any): ${fullName} {`);
  chunks.push(code`switch (object) {`);

  for (const valueDesc of enumDesc.value) {
    const memberName = getMemberName(ctx, enumDesc, valueDesc);
    const valueName = getValueName(ctx, fullName, valueDesc);
    chunks.push(code`
      case ${valueDesc.number}:
      case "${valueName}":
        return ${fullName}.${memberName};
    `);
  }

    // We use globalThis to avoid conflicts on protobuf types named `Error`.
    chunks.push(code`
      default:
        throw new ${utils.globalThis}.Error("Unrecognized enum value " + object + " for enum ${fullName}");
    `);

  chunks.push(code`}`);
  chunks.push(code`}`);
  return joinCode(chunks, { on: "\n" });
}

/** Generates a function with a big switch statement to encode our enum -> JSON. */
export function generateEnumToJson(
  ctx: Context,
  fullName: string,
  enumDesc: EnumDescriptorProto,
): Code {
  const { utils } = ctx;

  const chunks: Code[] = [];

  const functionName = uncapitalize(fullName) + "ToJSON";
  chunks.push(code`export function ${def(functionName)}(object: ${fullName}): string {`);
  chunks.push(code`switch (object) {`);

  for (const valueDesc of enumDesc.value) {
    const memberName = getMemberName(ctx, enumDesc, valueDesc);
    const valueName = getValueName(ctx, fullName, valueDesc);
    chunks.push(code`case ${fullName}.${memberName}: return "${valueName}";`);
  }

    // We use globalThis to avoid conflicts on protobuf types named `Error`.
    chunks.push(code`
      default:
        throw new ${utils.globalThis}.Error("Unrecognized enum value " + object + " for enum ${fullName}");
    `);

  chunks.push(code`}`);
  chunks.push(code`}`);
  return joinCode(chunks, { on: "\n" });
}

export function getMemberName(
  ctx: Context,
  enumDesc: EnumDescriptorProto,
  valueDesc: EnumValueDescriptorProto,
): string {
  return valueDesc.name;
}

function getValueName(ctx: Context, fullName: string, valueDesc: EnumValueDescriptorProto): string {
  return valueDesc.name;
}
