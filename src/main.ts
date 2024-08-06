import { code, Code, conditionalOutput, def, imp, joinCode } from "ts-poet";
import { ConditionalOutput } from "ts-poet/build/ConditionalOutput";
import {
  DescriptorProto,
  FieldDescriptorProto,
  FieldDescriptorProto_Type,
  FileDescriptorProto,
} from "ts-proto-descriptors";
import { capitalize } from "./case";
import { Context } from "./context";
import { generateEnum } from "./enums";
import { generateGenericServiceDefinition } from "./generate-generic-service-definition";

import { generateRpcType, generateService, generateServiceClientImpl } from "./generate-services";

import { DateOption, JsonTimestampOption, LongOption, Options, ServiceOption } from "./options";
import SourceInfo, { Fields } from "./sourceInfo";
import {
  basicTypeName,
  defaultValue,
  detectMapType,
  getEnumMethod,
  getFieldOptionsJsType,
  isAnyValueType,
  isBytes,
  isBytesValueType,
  isEnum,
  isFieldMaskType,
  isFieldMaskTypeName,
  isJsTypeFieldOption,
  isListValueType,
  isLong,
  isLongValueType,
  isMapType,
  isMessage,
  isOptionalProperty,
  isPrimitive,
  isRepeated,
  isScalar,
  isStructType,
  isTimestamp,
  isValueType,
  isWholeNumber,
  isWithinOneOf,
  notDefaultCheck,
  shouldGenerateJSMapType,
  toTypeName,
  valueTypeName,
} from "./types";
import {
  assertInstanceOf,
  FormattedMethodDescriptor,
  getFieldJsonName,
  getFieldName,
  getPropertyAccessor,
  impFile,
  impProto,
  addComment,
  maybePrefixPackage,
  nullOrUndefined,
  safeAccessor,
  withAndMaybeCheckIsNotNull,
} from "./utils";
import { visit, visitServices } from "./visit";

export function generateFile(ctx: Context, fileDesc: FileDescriptorProto): [string, Code] {
  const { options, utils } = ctx;

  // Google's protofiles are organized like Java, where package == the folder the file
  // is in, and file == a specific service within the package. I.e. you can have multiple
  // company/foo.proto and company/bar.proto files, where package would be 'company'.
  //
  // We'll match that structure by setting up the module path as:
  //
  // company/foo.proto --> company/foo.ts
  // company/bar.proto --> company/bar.ts
  //
  // We'll also assume that the fileDesc.name is already the `company/foo.proto` path, with
  // the package already implicitly in it, so we won't re-append/strip/etc. it out/back in.
  const suffix = `${options.fileSuffix}.ts`;
  const moduleName = fileDesc.name.replace(".proto", suffix);
  const chunks: Code[] = [];

  // // Indicate this file's source protobuf package for reflective use with google.protobuf.Any
  // if (options.exportCommonSymbols) {
  chunks.push(code`export const protobufPackage = '${fileDesc.package}';`);
  // }
  //
  // Syntax, unlike most fields, is not repeated and thus does not use an index
  const sourceInfo = SourceInfo.fromDescriptor(fileDesc);
  const headerComment = sourceInfo.lookup(Fields.file.syntax, undefined);
  addComment(headerComment, chunks, fileDesc.options?.deprecated);

  // Apply formatting to methods here, so they propagate globally
  for (let svc of fileDesc.service) {
    for (let i = 0; i < svc.method.length; i++) {
      svc.method[i] = new FormattedMethodDescriptor(svc.method[i], options);
    }
  }

  // first make all the type declarations
  visit(
    fileDesc,
    sourceInfo,
    (fullName, message, sInfo, fullProtoTypeName) => {
      chunks.push(
        generateInterfaceDeclaration(ctx, fullName, message, sInfo, maybePrefixPackage(fileDesc, fullProtoTypeName)),
      );
    },
    options,
    (fullName, enumDesc, sInfo) => {
      chunks.push(generateEnum(ctx, fullName, enumDesc, sInfo));
    },
  );

  visit(
    fileDesc,
    sourceInfo,
    (fullName, message, _sInfo, fullProtoTypeName) => {
      const fullTypeName = maybePrefixPackage(fileDesc, fullProtoTypeName);

      chunks.push(generateBaseInstanceFactory(ctx, fullName, message, fullTypeName));

      const staticMembers: Code[] = [];

      staticMembers.push(code`$type: '${fullTypeName}' as const`);

      staticMembers.push(generateFromJson(ctx, fullName, fullTypeName, message));
      staticMembers.push(generateToJson(ctx, fullName, fullTypeName, message));
      staticMembers.push(generateFromPartial(ctx, fullName, message));

      if (staticMembers.length > 0) {
        chunks.push(code`
            export const ${def(fullName)} = {
              ${joinCode(staticMembers, { on: ",\n\n" })}
            };
          `);
      }

      const messageTypeRegistry = impFile(options, "messageTypeRegistry@./typeRegistry");
      chunks.push(code`
            ${messageTypeRegistry}.set(${fullName}.$type, ${fullName});
          `);
    },
    options,
  );
  let hasStreamingMethods = false;

  visitServices(fileDesc, sourceInfo, (serviceDesc, sInfo) => {
    // FIXME: Weneed this outputServices option for this, probably should examine why that is
    const uniqueServices = [...new Set(options.outputServices)].sort();
    uniqueServices.forEach((outputService) => {
      if (outputService === ServiceOption.GENERIC) {
        chunks.push(generateGenericServiceDefinition(ctx, fileDesc, sInfo, serviceDesc));
      } else if (outputService === ServiceOption.DEFAULT) {
        // This service could be Twirp or grpc-web or JSON (maybe). So far all of their
        // interfaces are fairly similar so we share the same service interface.
        chunks.push(generateService(ctx, fileDesc, sInfo, serviceDesc));
        chunks.push(generateServiceClientImpl(ctx, fileDesc, serviceDesc));
      }
    });

    serviceDesc.method.forEach((methodDesc, _index) => {
      if (methodDesc.serverStreaming || methodDesc.clientStreaming) {
        hasStreamingMethods = true;
      }
    });
  });

  if (fileDesc.service.length > 0) {
    chunks.push(generateRpcType(ctx, hasStreamingMethods));
  }

  // https://www.typescriptlang.org/docs/handbook/2/modules.html:
  // > In TypeScript, just as in ECMAScript 2015, any file containing a top-level import or export is considered a module.
  // > Conversely, a file without any top-level import or export declarations is treated as a script whose contents are available in the global scope (and therefore to modules as well).
  //
  // Thus, to mark an empty file a module, we need to add `export {}` to it.
  if (options.esModuleInterop && chunks.length === 0) {
    chunks.push(code`export {};`);
  }

  chunks.push(
    ...Object.values(utils).map((v) => {
      if (v instanceof ConditionalOutput) {
        return code`${v.ifUsed}`;
      } else {
        return code``;
      }
    }),
  );

  // Finally, reset method definitions to their original state (unformatted)
  // This is mainly so that the `meta-typings` tests pass
  for (let svc of fileDesc.service) {
    for (let i = 0; i < svc.method.length; i++) {
      const methodInfo = svc.method[i];
      assertInstanceOf(methodInfo, FormattedMethodDescriptor);
      svc.method[i] = methodInfo.getSource();
    }
  }

  return [moduleName, joinCode(chunks, { on: "\n\n" })];
}

export type Utils = ReturnType<typeof makeDeepPartial> &
  ReturnType<typeof makeObjectIdMethods> &
  ReturnType<typeof makeTimestampMethods> &
  ReturnType<typeof makeByteUtils> &
  ReturnType<typeof makeComparisonUtils>;

/** These are runtime utility methods used by the generated code. */
export function makeUtils(options: Options): Utils {
  const bytes = makeByteUtils();
  const longs = makeLongUtils(options, bytes);
  return {
    ...bytes,
    ...makeDeepPartial(options, longs),
    ...makeObjectIdMethods(),
    ...makeTimestampMethods(options, longs, bytes),
    ...makeComparisonUtils(),
  };
}

function makeLongUtils(options: Options, bytes: ReturnType<typeof makeByteUtils>) {
  // Regardless of which `forceLong` config option we're using, we always use
  // the `long` library to either represent or at least sanity-check 64-bit values
  const util = impFile(options, `util@protobufjs/minimal`);
  const configure = impFile(options, `configure@protobufjs/minimal`);
  const LongImp = imp("Long=long");

  // Instead of exposing `LongImp` directly, let callers think that they are getting the
  // `imp(Long)` but really it is that + our long initialization snippet. This means the
  // initialization code will only be emitted in files that actually use the Long import.
  const Long = conditionalOutput(
    "Long",
    code`
      if (${util}.Long !== ${LongImp}) {
        ${util}.Long = ${LongImp} as any;
        ${configure}();
      }
    `,
  );

  const numberToLong = conditionalOutput(
    "numberToLong",
    code`
      function numberToLong(number: number) {
        return ${Long}.fromNumber(number);
      }
    `,
  );

  const longToString = conditionalOutput(
    "longToString",
    code`
      function longToString(long: ${Long}) {
        return long.toString();
      }
    `,
  );

  const longToBigint = conditionalOutput(
    "longToBigint",
    code`
      function longToBigint(long: ${Long}) {
        return BigInt(long.toString());
      }
    `,
  );

  const longToNumber = conditionalOutput(
    "longToNumber",
    code`
      function longToNumber(long: ${Long}): number {
        if (long.gt(${bytes.globalThis}.Number.MAX_SAFE_INTEGER)) {
          throw new ${bytes.globalThis}.Error("Value is larger than Number.MAX_SAFE_INTEGER")
        }
        if (long.lt(${bytes.globalThis}.Number.MIN_SAFE_INTEGER)) {
          throw new ${bytes.globalThis}.Error("Value is smaller than Number.MIN_SAFE_INTEGER")
        }
        return long.toNumber();
      }
    `,
  );

  return { numberToLong, longToNumber, longToString, longToBigint, Long };
}

function makeByteUtils() {
  const globalThis = conditionalOutput("globalThis", code``);

  function getBytesFromBase64Snippet() {
    return code`
      const bin = ${globalThis}.atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; ++i) {
          arr[i] = bin.charCodeAt(i);
      }
      return arr;
    `;
  }

  const bytesFromBase64 = conditionalOutput(
    "bytesFromBase64",
    code`
      function bytesFromBase64(b64: string): Uint8Array {
        ${getBytesFromBase64Snippet()}
      }
    `,
  );

  function getBase64FromBytesSnippet() {
    return code`
      const bin: string[] = [];
      arr.forEach((byte) => {
        bin.push(${globalThis}.String.fromCharCode(byte));
      });
      return ${globalThis}.btoa(bin.join(''));
    `;
  }

  const base64FromBytes = conditionalOutput(
    "base64FromBytes",
    code`
      function base64FromBytes(arr: Uint8Array): string {
        ${getBase64FromBytesSnippet()}
      }
    `,
  );
  return { globalThis, bytesFromBase64, base64FromBytes };
}

function makeDeepPartial(options: Options, longs: ReturnType<typeof makeLongUtils>) {
  const maybeExport = "export";
  // Allow passing longs as numbers or strings, nad we'll convert them
  const maybeLong =
    options.forceLong === LongOption.LONG ? code` : T extends ${longs.Long} ? string | number | Long ` : "";

  const Builtin = conditionalOutput(
    "Builtin",
    code`type Builtin = Date | Function | Uint8Array | string | number | boolean |${
      options.forceLong === LongOption.BIGINT ? " bigint |" : ""
    } undefined;`,
  );

  // Based on https://github.com/sindresorhus/type-fest/pull/259
  const maybeExcludeType = `| '$type'`;
  const Exact = conditionalOutput(
    "Exact",
    code`
      type KeysOfUnion<T> = T extends T ? keyof T : never;
      ${maybeExport} type Exact<P, I extends P> = P extends ${Builtin}
        ? P
        : P &
        { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P> ${maybeExcludeType}>]: never };
    `,
  );

  // Based on the type from ts-essentials
  const keys = code`Exclude<keyof T, '$type'>`;
  const DeepPartial = conditionalOutput(
    "DeepPartial",
    code`
      ${maybeExport} type DeepPartial<T> =  T extends ${Builtin}
        ? T
        ${maybeLong}
        : T extends globalThis.Array<infer U>
        ? globalThis.Array<DeepPartial<U>>
        : T extends ReadonlyArray<infer U>
        ? ReadonlyArray<DeepPartial<U>>
        : T extends {}
        ? { [K in ${keys}]?: DeepPartial<T[K]> }
        : Partial<T>;
    `,
  );

  return { Builtin, DeepPartial, Exact };
}

function makeObjectIdMethods() {
  const mongodb = imp("mongodb*mongodb");

  const fromProtoObjectId = conditionalOutput(
    "fromProtoObjectId",
    code`
      function fromProtoObjectId(oid: ObjectId): ${mongodb}.ObjectId {
        return new ${mongodb}.ObjectId(oid.value);
      }
    `,
  );

  const fromJsonObjectId = conditionalOutput(
    "fromJsonObjectId",
    code`
      function fromJsonObjectId(o: any): ${mongodb}.ObjectId {
        if (o instanceof ${mongodb}.ObjectId) {
          return o;
        } else if (typeof o === "string") {
          return new ${mongodb}.ObjectId(o);
        } else {
          return ${fromProtoObjectId}(ObjectId.fromJSON(o));
        }
      }
    `,
  );

  const toProtoObjectId = conditionalOutput(
    "toProtoObjectId",
    code`
      function toProtoObjectId(oid: ${mongodb}.ObjectId): ObjectId {
        const value = oid.toString();
        return { value };
      }
    `,
  );

  return { fromJsonObjectId, fromProtoObjectId, toProtoObjectId };
}

function makeTimestampMethods(
  options: Options,
  longs: ReturnType<typeof makeLongUtils>,
  bytes: ReturnType<typeof makeByteUtils>,
) {
  const Timestamp = impProto(options, "google/protobuf/timestamp", "Timestamp");
  const NanoDate = imp("NanoDate=nano-date");

  let seconds: string | Code = "Math.trunc(date.getTime() / 1_000)";
  let toNumberCode: string | Code = "t.seconds";
  const makeToNumberCode = (methodCall: string) => `t.seconds${options.useOptionals === "all" || ""}.${methodCall}`;

  if (options.forceLong === LongOption.LONG) {
    toNumberCode = makeToNumberCode("toNumber()");
    seconds = code`${longs.numberToLong}(${seconds})`;
  } else if (options.forceLong === LongOption.BIGINT) {
    toNumberCode = code`${bytes.globalThis}.Number(${makeToNumberCode("toString()")})`;
    seconds = code`BigInt(${seconds})`;
  } else if (options.forceLong === LongOption.STRING) {
    toNumberCode = code`${bytes.globalThis}.Number(t.seconds)`;
    seconds = code`${seconds}.toString()`;
  }

  const maybeTypeField = `$type: 'google.protobuf.Timestamp',`;

  const toTimestamp = conditionalOutput(
    "toTimestamp",
    options.useDate === DateOption.STRING
      ? code`
          function toTimestamp(dateStr: string): ${Timestamp} {
            const date = new ${bytes.globalThis}.Date(dateStr);
            const seconds = ${seconds};
            const nanos = (date.getTime() % 1_000) * 1_000_000;
            return { ${maybeTypeField} seconds, nanos };
          }
        `
      : options.useDate === DateOption.STRING_NANO
      ? code`
          function toTimestamp(dateStr: string): ${Timestamp} {
            const nanoDate = new ${NanoDate}(dateStr);

            const date = {
              getTime: (): number => nanoDate.valueOf(),
            } as const;
            const seconds = ${seconds};

            let nanos = nanoDate.getMilliseconds() * 1_000_000;
            nanos += nanoDate.getMicroseconds() * 1_000;
            nanos += nanoDate.getNanoseconds();

            return { ${maybeTypeField} seconds, nanos };
          }
        `
      : code`
          function toTimestamp(date: Date): ${Timestamp} {
            const seconds = ${seconds};
            const nanos = (date.getTime() % 1_000) * 1_000_000;
            return { ${maybeTypeField} seconds, nanos };
          }
        `,
  );

  const fromTimestamp = conditionalOutput(
    "fromTimestamp",
    options.useDate === DateOption.STRING
      ? code`
          function fromTimestamp(t: ${Timestamp}): string {
            let millis = (${toNumberCode} || 0) * 1_000;
            millis += (t.nanos || 0) / 1_000_000;
            return new ${bytes.globalThis}.Date(millis).toISOString();
          }
        `
      : options.useDate === DateOption.STRING_NANO
      ? code`
          function fromTimestamp(t: ${Timestamp}): string {
            const seconds = ${toNumberCode} || 0;
            const nanos = (t.nanos || 0) % 1_000;
            const micros = Math.trunc(((t.nanos || 0) % 1_000_000) / 1_000)
            let millis = seconds * 1_000;
            millis += Math.trunc((t.nanos || 0) / 1_000_000);

            const nanoDate = new ${NanoDate}(millis);
            nanoDate.setMicroseconds(micros);
            nanoDate.setNanoseconds(nanos);

            return nanoDate.toISOStringFull();
          }
        `
      : code`
          function fromTimestamp(t: ${Timestamp}): Date {
            let millis = (${toNumberCode} || 0) * 1_000;
            millis += (t.nanos || 0) / 1_000_000;
            return new ${bytes.globalThis}.Date(millis);
          }
        `,
  );

  const fromJsonTimestamp = conditionalOutput(
    "fromJsonTimestamp",
    options.useDate === DateOption.DATE
      ? code`
        function fromJsonTimestamp(o: any): Date {
          if (o instanceof ${bytes.globalThis}.Date) {
            return o;
          } else if (typeof o === "string") {
            return new ${bytes.globalThis}.Date(o);
          } else {
            return ${fromTimestamp}(Timestamp.fromJSON(o));
          }
        }
      `
      : code`
        function fromJsonTimestamp(o: any): Timestamp {
          if (o instanceof ${bytes.globalThis}.Date) {
            return ${toTimestamp}(o);
          } else if (typeof o === "string") {
            return ${toTimestamp}(new ${bytes.globalThis}.Date(o));
          } else {
            return Timestamp.fromJSON(o);
          }
        }
      `,
  );

  return { toTimestamp, fromTimestamp, fromJsonTimestamp };
}

function makeComparisonUtils() {
  const isObject = conditionalOutput(
    "isObject",
    code`
    function isObject(value: any): boolean {
      return typeof value === 'object' && value !== null;
    }`,
  );

  const isSet = conditionalOutput(
    "isSet",
    code`
    function isSet(value: any): boolean {
      return value !== null && value !== undefined;
    }`,
  );

  return { isObject, isSet };
}

// Create the interface with properties
function generateInterfaceDeclaration(
  ctx: Context,
  fullName: string,
  messageDesc: DescriptorProto,
  sourceInfo: SourceInfo,
  fullTypeName: string,
): Code {
  const { options } = ctx;
  const chunks: Code[] = [];

  addComment(sourceInfo, chunks, messageDesc.options?.deprecated);
  // interface name should be defined to avoid import collisions
  chunks.push(code`export interface ${def(fullName)} {`);

  chunks.push(code`$type: '${fullTypeName}',`);

  messageDesc.field.forEach((fieldDesc, index) => {
    const info = sourceInfo.lookup(Fields.message.field, index);
    addComment(info, chunks, fieldDesc.options?.deprecated);
    const fieldKey = safeAccessor(getFieldName(fieldDesc, options));
    const isOptional = isOptionalProperty(fieldDesc, messageDesc.options, options);
    const type = toTypeName(ctx, messageDesc, fieldDesc, isOptional);
    chunks.push(code`${fieldKey}${isOptional ? "?" : ""}: ${type}, `);
  });

  chunks.push(code`}`);
  return joinCode(chunks, { on: "\n" });
}

// Create a function that constructs 'base' instance with default values for decode to use as a prototype
function generateBaseInstanceFactory(
  ctx: Context,
  fullName: string,
  messageDesc: DescriptorProto,
  fullTypeName: string,
): Code {
  const { options } = ctx;
  const fields: Code[] = [];

  for (const field of messageDesc.field) {
    const fieldKey = safeAccessor(getFieldName(field, options));
    const val = isWithinOneOf(field)
      ? nullOrUndefined()
      : isMapType(ctx, messageDesc, field)
      ? shouldGenerateJSMapType(ctx, messageDesc, field)
        ? "new Map()"
        : "{}"
      : isRepeated(field)
      ? "[]"
      : defaultValue(ctx, field);

    fields.push(code`${fieldKey}: ${val}`);
  }

  fields.unshift(code`$type: '${fullTypeName}'`);

  return code`
    function createBase${fullName}(): ${fullName} {
      return { ${joinCode(fields, { on: "," })} };
    }
  `;
}

/**
 * Creates a function to decode a message from JSON.
 *
 * This is very similar to decode, we loop through looking for properties, with
 * a few special cases for https://developers.google.com/protocol-buffers/docs/proto3#json.
 * */
function generateFromJson(ctx: Context, fullName: string, fullTypeName: string, messageDesc: DescriptorProto): Code {
  const { options, utils } = ctx;
  const chunks: Code[] = [];

  // create the basic function declaration
  chunks.push(code`
    fromJSON(${messageDesc.field.length > 0 ? "object" : "_"}: any): ${fullName} {
      return {
  `);

  chunks.push(code`$type: ${fullName}.$type,`);

  const canonicalFromJson: { [key: string]: { [field: string]: (from: string) => Code } } = {
    ["google.protobuf.FieldMask"]: {
      paths: (from: string) => code`typeof(${from}) === 'string'
        ? ${from}.split(",").filter(${ctx.utils.globalThis}.Boolean)
        : ${ctx.utils.globalThis}.Array.isArray(${from}?.paths)
        ? ${from}.paths.map(${ctx.utils.globalThis}.String)
        : []`,
    },
  };

  // add a check for each incoming field
  messageDesc.field.forEach((field) => {
    const fieldName = getFieldName(field, options);
    const fieldKey = safeAccessor(fieldName);
    const jsonName = getFieldJsonName(field, options);
    const jsonProperty = getPropertyAccessor("object", jsonName);
    const jsonPropertyOptional = getPropertyAccessor("object", jsonName, true);

    // get code that extracts value from incoming object
    const readSnippet = (from: string): Code => {
      if (isEnum(field)) {
        const fromJson = getEnumMethod(ctx, field.typeName, "FromJSON");
        return code`${fromJson}(${from})`;
      } else if (isPrimitive(field)) {
        // Convert primitives using the String(value)/Number(value)/bytesFromBase64(value)
        if (isBytes(field)) {
          return code`${utils.bytesFromBase64}(${from})`;
        } else if (isLong(field) && isJsTypeFieldOption(options, field)) {
          const fieldType = getFieldOptionsJsType(field, ctx.options) ?? field.type;
          const cstr = capitalize(
            basicTypeName(ctx, { ...field, type: fieldType }, { keepValueType: true }).toCodeString([]),
          );
          return code`${utils.globalThis}.${cstr}(${from})`;
        } else if (isLong(field) && options.forceLong === LongOption.LONG) {
          const cstr = capitalize(basicTypeName(ctx, field, { keepValueType: true }).toCodeString([]));
          return code`${cstr}.fromValue(${from})`;
        } else if (isLong(field) && options.forceLong === LongOption.BIGINT) {
          return code`BigInt(${from})`;
        } else {
          const cstr = capitalize(basicTypeName(ctx, field, { keepValueType: true }).toCodeString([]));
          return code`${utils.globalThis}.${cstr}(${from})`;
        }
      } else if (
        isTimestamp(field) &&
        (options.useDate === DateOption.STRING || options.useDate === DateOption.STRING_NANO)
      ) {
        return code`${utils.globalThis}.String(${from})`;
      } else if (
        isTimestamp(field) &&
        (options.useDate === DateOption.DATE || options.useDate === DateOption.TIMESTAMP)
      ) {
        return code`${utils.fromJsonTimestamp}(${from})`;
      } else if (isAnyValueType(field) || isStructType(field)) {
        return code`${from}`;
      } else if (isFieldMaskType(field)) {
        const type = basicTypeName(ctx, field, { keepValueType: true });
        return code`${type}.unwrap(${type}.fromJSON(${from}))`;
      } else if (isListValueType(field)) {
        return code`[...${from}]`;
      } else if (isValueType(ctx, field)) {
        const valueType = valueTypeName(ctx, field.typeName)!;
        if (isLongValueType(field) && options.forceLong === LongOption.LONG) {
          return code`${capitalize(valueType.toCodeString([]))}.fromValue(${from})`;
        } else if (isLongValueType(field) && options.forceLong === LongOption.BIGINT) {
          return code`BigInt(${from})`;
        } else if (isBytesValueType(field)) {
          return code`new ${capitalize(valueType.toCodeString([]))}(${from})`;
        } else {
          return code`${capitalize(valueType.toCodeString([]))}(${from})`;
        }
      } else if (isMessage(field)) {
        if (isRepeated(field) && isMapType(ctx, messageDesc, field)) {
          const { valueField, valueType } = detectMapType(ctx, messageDesc, field)!;
          if (isPrimitive(valueField)) {
            // TODO Can we not copy/paste this from ^?
            if (isBytes(valueField)) {
              return code`${utils.bytesFromBase64}(${from} as string)`;
            } else if (isLong(valueField) && options.forceLong === LongOption.LONG) {
              return code`Long.fromValue(${from} as Long | string)`;
            } else if (isLong(valueField) && options.forceLong === LongOption.BIGINT) {
              return code`BigInt(${from} as string | number | bigint | boolean)`;
            } else if (isEnum(valueField)) {
              const fromJson = getEnumMethod(ctx, valueField.typeName, "FromJSON");
              return code`${fromJson}(${from})`;
            } else {
              const cstr = capitalize(valueType.toCodeString([]));
              return code`${cstr}(${from})`;
            }
          } else if (
            isTimestamp(valueField) &&
            (options.useDate === DateOption.STRING || options.useDate === DateOption.STRING_NANO)
          ) {
            return code`${utils.globalThis}.String(${from})`;
          } else if (
            isTimestamp(valueField) &&
            (options.useDate === DateOption.DATE || options.useDate === DateOption.TIMESTAMP)
          ) {
            return code`${utils.fromJsonTimestamp}(${from})`;
          } else if (isValueType(ctx, valueField)) {
            return code`${from} as ${valueType}`;
          } else if (isAnyValueType(valueField)) {
            return code`${from}`;
          } else {
            return code`${valueType}.fromJSON(${from})`;
          }
        } else {
          const type = basicTypeName(ctx, field);
          return code`${type}.fromJSON(${from})`;
        }
      } else {
        throw new Error(`Unhandled field ${field}`);
      }
    };

    // and then use the snippet to handle repeated fields if necessary
    if (canonicalFromJson[fullTypeName]?.[fieldName]) {
      chunks.push(code`${fieldName}: ${canonicalFromJson[fullTypeName][fieldName]("object")},`);
    } else if (isRepeated(field)) {
      if (isMapType(ctx, messageDesc, field)) {
        const fieldType = toTypeName(ctx, messageDesc, field);
        const i = convertFromObjectKey(ctx, messageDesc, field, "key");

        if (shouldGenerateJSMapType(ctx, messageDesc, field)) {
          const fallback = "new Map()";

          chunks.push(code`
            ${fieldKey}: ${ctx.utils.isObject}(${jsonProperty})
              ? Object.entries(${jsonProperty}).reduce<${fieldType}>((acc, [key, value]) => {
                  acc.set(${i}, ${readSnippet("value")});
                  return acc;
                }, new Map())
              : ${fallback},
          `);
        } else {
          const fallback = "{}";

          chunks.push(code`
            ${fieldKey}: ${ctx.utils.isObject}(${jsonProperty})
              ? Object.entries(${jsonProperty}).reduce<${fieldType}>((acc, [key, value]) => {
                  acc[${i}] = ${readSnippet("value")};
                  return acc;
                }, {})
              : ${fallback},
          `);
        }
      } else {
        const fallback = "[]";

        const readValueSnippet = readSnippet("e");
        if (readValueSnippet.toString() === code`e`.toString()) {
          chunks.push(
            code`${fieldKey}: ${ctx.utils.globalThis}.Array.isArray(${jsonPropertyOptional}) ? [...${jsonProperty}] : [],`,
          );
        } else {
          // Explicit `any` type required to make TS with noImplicitAny happy. `object` is also `any` here.
          chunks.push(code`
            ${fieldKey}: ${ctx.utils.globalThis}.Array.isArray(${jsonPropertyOptional}) ? ${jsonProperty}.map((e: any) => ${readValueSnippet}): ${fallback},
          `);
        }
      }
    } else if (isAnyValueType(field)) {
      chunks.push(code`${fieldKey}: ${ctx.utils.isSet}(${jsonPropertyOptional})
        ? ${readSnippet(`${jsonProperty}`)}
        : ${nullOrUndefined()},
      `);
    } else if (isStructType(field)) {
      chunks.push(
        code`${fieldKey}: ${ctx.utils.isObject}(${jsonProperty})
          ? ${readSnippet(`${jsonProperty}`)}
          : ${nullOrUndefined()},`,
      );
    } else if (isListValueType(field)) {
      chunks.push(code`
        ${fieldKey}: ${ctx.utils.globalThis}.Array.isArray(${jsonProperty})
          ? ${readSnippet(`${jsonProperty}`)}
          : ${nullOrUndefined()},
      `);
    } else {
      const fallback = isWithinOneOf(field) ? nullOrUndefined() : defaultValue(ctx, field);
      chunks.push(code`
        ${fieldKey}: ${ctx.utils.isSet}(${jsonProperty})
          ? ${readSnippet(`${jsonProperty}`)}
          : ${fallback},
      `);
    }
  });
  // and then wrap up the switch/while/return
  chunks.push(code`};`);
  chunks.push(code`}`);
  return joinCode(chunks, { on: "\n" });
}

function generateCanonicalToJson(
  fullName: string,
  fullProtobufTypeName: string,
  { useOptionals }: Options,
): Code | undefined {
  if (isFieldMaskTypeName(fullProtobufTypeName)) {
    const returnType = useOptionals === "all" ? `string | ${nullOrUndefined()}` : "string";
    const pathModifier = useOptionals === "all" ? "?" : "";

    return code`
    toJSON(message: ${fullName}): ${returnType} {
      return message.paths${pathModifier}.join(',');
    }
  `;
  }
  return undefined;
}

function generateToJson(
  ctx: Context,
  fullName: string,
  fullProtobufTypeName: string,
  messageDesc: DescriptorProto,
): Code {
  const { options, utils, typeMap } = ctx;
  const chunks: Code[] = [];

  const canonicalToJson = generateCanonicalToJson(fullName, fullProtobufTypeName, options);
  if (canonicalToJson) {
    chunks.push(canonicalToJson);
    return joinCode(chunks, { on: "\n" });
  }

  // create the basic function declaration
  chunks.push(code`
    toJSON(${messageDesc.field.length > 0 ? "message" : "_"}: ${fullName}): unknown {
      const obj: any = {};
  `);

  // then add a case for each field
  messageDesc.field.forEach((field) => {
    const fieldName = getFieldName(field, options);
    const jsonName = getFieldJsonName(field, options);
    const jsonProperty = getPropertyAccessor("obj", jsonName);
    const messageProperty = getPropertyAccessor("message", fieldName);

    const readSnippet = (from: string): Code => {
      if (isEnum(field)) {
        const toJson = getEnumMethod(ctx, field.typeName, "ToJSON");
        return code`${toJson}(${from})`;
      } else if (isTimestamp(field) && options.useDate === DateOption.DATE) {
        return code`${from}.toISOString()`;
      } else if (
        isTimestamp(field) &&
        (options.useDate === DateOption.STRING || options.useDate === DateOption.STRING_NANO)
      ) {
        return code`${from}`;
      } else if (isTimestamp(field) && options.useDate === DateOption.TIMESTAMP) {
        if (options.useJsonTimestamp === JsonTimestampOption.RAW) {
          return code`${from}`;
        }
        return code`${utils.fromTimestamp}(${from}).toISOString()`;
      } else if (isMapType(ctx, messageDesc, field)) {
        // For map types, drill-in and then admittedly re-hard-code our per-value-type logic
        const valueType = (typeMap.get(field.typeName)![2] as DescriptorProto).field[1];
        if (isEnum(valueType)) {
          const toJson = getEnumMethod(ctx, valueType.typeName, "ToJSON");
          return code`${toJson}(${from})`;
        } else if (isBytes(valueType)) {
          return code`${utils.base64FromBytes}(${from})`;
        } else if (isTimestamp(valueType) && options.useDate === DateOption.DATE) {
          return code`${from}.toISOString()`;
        } else if (
          isTimestamp(valueType) &&
          (options.useDate === DateOption.STRING || options.useDate === DateOption.STRING_NANO)
        ) {
          return code`${from}`;
        } else if (isTimestamp(valueType) && options.useDate === DateOption.TIMESTAMP) {
          return code`${utils.fromTimestamp}(${from}).toISOString()`;
        } else if (isLong(valueType) && options.forceLong === LongOption.LONG) {
          return code`${from}.toString()`;
        } else if (isLong(valueType) && options.forceLong === LongOption.BIGINT) {
          return code`${from}.toString()`;
        } else if (isWholeNumber(valueType) && !(isLong(valueType) && options.forceLong === LongOption.STRING)) {
          return code`Math.round(${from})`;
        } else if (isScalar(valueType) || isValueType(ctx, valueType)) {
          return code`${from}`;
        } else if (isAnyValueType(valueType)) {
          return code`${from}`;
        } else {
          const type = basicTypeName(ctx, valueType);
          return code`${type}.toJSON(${from})`;
        }
      } else if (isAnyValueType(field)) {
        return code`${from}`;
      } else if (isFieldMaskType(field)) {
        const type = basicTypeName(ctx, field, { keepValueType: true });
        return code`${type}.toJSON(${type}.wrap(${from}))`;
      } else if (isMessage(field) && !isValueType(ctx, field) && !isMapType(ctx, messageDesc, field)) {
        const type = basicTypeName(ctx, field, { keepValueType: true });
        return code`${type}.toJSON(${from})`;
      } else if (isBytes(field)) {
        return code`${utils.base64FromBytes}(${from})`;
      } else if (isLong(field) && isJsTypeFieldOption(options, field)) {
        const fieldType = getFieldOptionsJsType(field, ctx.options) ?? field.type;
        if (!fieldType) {
          return code`${from}`;
        }

        const cstr = capitalize(
          basicTypeName(ctx, { ...field, type: fieldType }, { keepValueType: true }).toCodeString([]),
        );
        return code`${utils.globalThis}.${cstr}(${from})`;
      } else if (isLong(field) && options.forceLong === LongOption.LONG) {
        return code`(${from} || ${defaultValue(ctx, field)}).toString()`;
      } else if (isLong(field) && options.forceLong === LongOption.BIGINT) {
        return code`${from}.toString()`;
      } else if (isWholeNumber(field) && !(isLong(field) && options.forceLong === LongOption.STRING)) {
        return code`Math.round(${from})`;
      } else {
        return code`${from}`;
      }
    };

    if (isMapType(ctx, messageDesc, field)) {
      // Maps might need their values transformed, i.e. bytes --> base64
      const i = convertToObjectKey(ctx, messageDesc, field, "k");

      if (shouldGenerateJSMapType(ctx, messageDesc, field)) {
        chunks.push(code`
          if (${messageProperty}?.size) {
            ${jsonProperty} = {};
            ${messageProperty}.forEach((v, k) => {
              ${jsonProperty}[${i}] = ${readSnippet("v")};
            });
          }
        `);
      } else {
        chunks.push(code`
        if (${messageProperty}) {
            const entries = Object.entries(${messageProperty});
            if (entries.length > 0) {
              ${jsonProperty} = {};
              entries.forEach(([k, v]) => {
                ${jsonProperty}[${i}] = ${readSnippet("v")};
              });
            }
          }
        `);
      }
    } else if (isRepeated(field)) {
      // Arrays might need their elements transformed
      const transformElement = readSnippet("e");
      const maybeMap = transformElement.toCodeString([]) !== "e" ? code`.map(e => ${transformElement})` : "";
      chunks.push(code`
        if (${messageProperty}?.length) {
          ${jsonProperty} = ${messageProperty}${maybeMap};
        }
      `);
    } else {
      let emitDefaultValuesForJson = ctx.options.emitDefaultValues.includes("json-methods");
      const check =
        (isScalar(field) || isEnum(field)) && !(isWithinOneOf(field) || emitDefaultValuesForJson)
          ? notDefaultCheck(ctx, field, messageDesc.options, `${messageProperty}`)
          : `${messageProperty} !== undefined ${withAndMaybeCheckIsNotNull(messageProperty)}`;

      chunks.push(code`
        if (${check}) {
          ${jsonProperty} = ${readSnippet(`${messageProperty}`)};
        }
      `);
    }
  });
  chunks.push(code`return obj;`);
  chunks.push(code`}`);
  return joinCode(chunks, { on: "\n" });
}

function generateFromPartial(ctx: Context, fullName: string, messageDesc: DescriptorProto): Code {
  const { options, utils } = ctx;
  const chunks: Code[] = [];

  // create the create function definition
  chunks.push(code`
      create<I extends ${utils.Exact}<${utils.DeepPartial}<${fullName}>, I>>(base?: I): ${fullName} {
        return ${fullName}.fromPartial(base ?? ({} as any));
      },
    `);

  // create the fromPartial function declaration
  const paramName = messageDesc.field.length > 0 ? "object" : "_";

  chunks.push(code`
      fromPartial<I extends ${utils.Exact}<${utils.DeepPartial}<${fullName}>, I>>(${paramName}: I): ${fullName} {
    `);

  let createBase = code`createBase${fullName}()`;

  chunks.push(code`const message = ${createBase};`);

  // add a check for each incoming field
  messageDesc.field.forEach((field) => {
    const fieldName = getFieldName(field, options);
    const messageProperty = getPropertyAccessor("message", fieldName);
    const objectProperty = getPropertyAccessor("object", fieldName);

    const readSnippet = (from: string): Code => {
      if (
        (isLong(field) || isLongValueType(field)) &&
        options.forceLong === LongOption.LONG &&
        !isJsTypeFieldOption(options, field)
      ) {
        return code`Long.fromValue(${from})`;
      } else if (
        isPrimitive(field) ||
        (isTimestamp(field) &&
          (options.useDate === DateOption.DATE ||
            options.useDate === DateOption.STRING ||
            options.useDate === DateOption.STRING_NANO)) ||
        isValueType(ctx, field)
      ) {
        return code`${from}`;
      } else if (isMessage(field)) {
        if (isRepeated(field) && isMapType(ctx, messageDesc, field)) {
          const { valueField, valueType } = detectMapType(ctx, messageDesc, field)!;
          if (isPrimitive(valueField)) {
            if (isBytes(valueField)) {
              return code`${from}`;
            } else if (isEnum(valueField)) {
              return code`${from} as ${valueType}`;
            } else if (isLong(valueField) && options.forceLong === LongOption.LONG) {
              return code`Long.fromValue(${from})`;
            } else if (isLong(valueField) && options.forceLong === LongOption.BIGINT) {
              return code`BigInt(${from} as string | number | bigint | boolean)`;
            } else {
              const cstr = capitalize(valueType.toCodeString([]));
              return code`${utils.globalThis}.${cstr}(${from})`;
            }
          } else if (isAnyValueType(valueField)) {
            return code`${from}`;
          } else if (
            isTimestamp(valueField) &&
            (options.useDate === DateOption.DATE ||
              options.useDate === DateOption.STRING ||
              options.useDate === DateOption.STRING_NANO)
          ) {
            return code`${from}`;
          } else if (isValueType(ctx, valueField)) {
            return code`${from}`;
          } else {
            const type = basicTypeName(ctx, valueField);
            return code`${type}.fromPartial(${from})`;
          }
        } else if (isAnyValueType(field)) {
          return code`${from}`;
        } else {
          const type = basicTypeName(ctx, field);
          return code`${type}.fromPartial(${from})`;
        }
      } else {
        throw new Error(`Unhandled field ${field}`);
      }
    };

    // and then use the snippet to handle repeated fields if necessary
    if (isRepeated(field)) {
      if (isMapType(ctx, messageDesc, field)) {
        const fieldType = toTypeName(ctx, messageDesc, field);
        const i = convertFromObjectKey(ctx, messageDesc, field, "key");

        if (shouldGenerateJSMapType(ctx, messageDesc, field)) {
          chunks.push(code`
            ${messageProperty} = (() => {
              const m = new Map();
              (${objectProperty} as ${fieldType} ?? new Map()).forEach((value, key) => {
                if (value !== undefined) {
                  m.set(key, ${readSnippet("value")});
                }
              });
              return m;
            })();
          `);
        } else {
          chunks.push(code`
            ${messageProperty} = Object.entries(${objectProperty} ?? {}).reduce<${fieldType}>((acc, [key, value]) => {
              if (value !== undefined) {
                acc[${i}] = ${readSnippet("value")};
              }
              return acc;
            }, {});
          `);
        }
      } else {
        chunks.push(code`
          ${messageProperty} = ${objectProperty}?.map((e) => ${readSnippet("e")}) || [];
        `);
      }
    } else if (readSnippet(`x`).toCodeString([]) == "x") {
      // An optimized case of the else below that works when `readSnippet` returns the plain input
      const fallback = isWithinOneOf(field) ? "undefined" : defaultValue(ctx, field);
      chunks.push(code`${messageProperty} = ${objectProperty} ?? ${fallback};`);
    } else {
      const fallback = isWithinOneOf(field) ? "undefined" : defaultValue(ctx, field);
      chunks.push(code`
        ${messageProperty} = (${objectProperty} !== undefined && ${objectProperty} !== null)
          ? ${readSnippet(`${objectProperty}`)}
          : ${fallback};
      `);
    }
  });

  // and then wrap up the switch/while/return
  chunks.push(code`return message;`);
  chunks.push(code`}`);
  return joinCode(chunks, { on: "\n" });
}

function convertFromObjectKey(
  ctx: Context,
  messageDesc: DescriptorProto,
  field: FieldDescriptorProto,
  variableName: string,
): Code {
  const { keyType, keyField } = detectMapType(ctx, messageDesc, field)!;
  if (keyType.toCodeString([]) === "string") {
    return code`${variableName}`;
  } else if (isLong(keyField) && shouldGenerateJSMapType(ctx, messageDesc, field)) {
    if (ctx.options.forceLong === LongOption.LONG) {
      return code`${capitalize(keyType.toCodeString([]))}.fromValue(${variableName})`;
    } else if (ctx.options.forceLong === LongOption.BIGINT) {
      return code`BigInt(${variableName})`;
    } else if (ctx.options.forceLong === LongOption.STRING) {
      return code`${ctx.utils.globalThis}.String(${variableName})`;
    } else {
      return code`${ctx.utils.globalThis}.Number(${variableName})`;
    }
  } else if (keyField.type === FieldDescriptorProto_Type.TYPE_BOOL) {
    return code`${ctx.utils.globalThis}.Boolean(${variableName})`;
  } else {
    return code`${ctx.utils.globalThis}.Number(${variableName})`;
  }
}

function convertToObjectKey(
  ctx: Context,
  messageDesc: DescriptorProto,
  field: FieldDescriptorProto,
  variableName: string,
): Code {
  const { keyType, keyField } = detectMapType(ctx, messageDesc, field)!;
  if (keyType.toCodeString([]) === "string") {
    return code`${variableName}`;
  } else if (isLong(keyField) && shouldGenerateJSMapType(ctx, messageDesc, field)) {
    if (ctx.options.forceLong === LongOption.BIGINT) {
      return code`${variableName}.toString()`;
    } else {
      return code`${variableName}`;
    }
  } else if (keyField.type === FieldDescriptorProto_Type.TYPE_BOOL) {
    return code`${ctx.utils.globalThis}.String(${variableName})`;
  } else {
    return code`${variableName}`;
  }
}
