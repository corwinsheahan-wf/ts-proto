import { Code, Import, code, imp } from "ts-poet";
import {
  CodeGeneratorRequest,
  DescriptorProto,
  EnumDescriptorProto,
  FieldDescriptorProto,
  FieldDescriptorProto_Label,
  FieldDescriptorProto_Type,
  MessageOptions,
  MethodDescriptorProto,
} from "ts-proto-descriptors";
import { uncapitalize } from "./case";
import { BaseContext } from "./context";
import SourceInfo from "./sourceInfo";
import { fail, impProto } from "./utils";
import { visit } from "./visit";

export function basicLongWireType(type: FieldDescriptorProto_Type): number | undefined {
  switch (type) {
    case FieldDescriptorProto_Type.TYPE_INT64:
    case FieldDescriptorProto_Type.TYPE_UINT64:
    case FieldDescriptorProto_Type.TYPE_SINT64:
      return 0;
    case FieldDescriptorProto_Type.TYPE_FIXED64:
    case FieldDescriptorProto_Type.TYPE_SFIXED64:
      return 1;
    default:
      return undefined;
  }
}

/** Returns the type name without any repeated/required/etc. labels. */
export function basicTypeName(
  ctx: BaseContext,
  field: FieldDescriptorProto,
  typeOptions: { keepValueType?: boolean } = {},
): Code {
  const fieldType = field.type;

  switch (fieldType) {
    case FieldDescriptorProto_Type.TYPE_DOUBLE:
    case FieldDescriptorProto_Type.TYPE_FLOAT:
    case FieldDescriptorProto_Type.TYPE_INT32:
    case FieldDescriptorProto_Type.TYPE_UINT32:
    case FieldDescriptorProto_Type.TYPE_SINT32:
    case FieldDescriptorProto_Type.TYPE_FIXED32:
    case FieldDescriptorProto_Type.TYPE_SFIXED32:
      return code`number`;
    case FieldDescriptorProto_Type.TYPE_INT64:
    case FieldDescriptorProto_Type.TYPE_UINT64:
    case FieldDescriptorProto_Type.TYPE_SINT64:
    case FieldDescriptorProto_Type.TYPE_FIXED64:
    case FieldDescriptorProto_Type.TYPE_SFIXED64:
      return longTypeName();
    case FieldDescriptorProto_Type.TYPE_BOOL:
      return code`boolean`;
    case FieldDescriptorProto_Type.TYPE_STRING:
      return code`string`;
    case FieldDescriptorProto_Type.TYPE_BYTES:
      return code`Uint8Array`;
    case FieldDescriptorProto_Type.TYPE_MESSAGE:
    case FieldDescriptorProto_Type.TYPE_GROUP:
    case FieldDescriptorProto_Type.TYPE_ENUM:
      return messageToTypeName(ctx, field.typeName, { ...typeOptions, repeated: isRepeated(field) });
    default:
      return code`${field.typeName}`;
  }
}

export function defaultValue(ctx: BaseContext, field: FieldDescriptorProto): any {
  const { typeMap } = ctx;

  const useDefaultValue = false;
  const numericDefaultVal = useDefaultValue ? field.defaultValue : 0;
  switch (field.type) {
    case FieldDescriptorProto_Type.TYPE_DOUBLE:
    case FieldDescriptorProto_Type.TYPE_FLOAT:
    case FieldDescriptorProto_Type.TYPE_INT32:
    case FieldDescriptorProto_Type.TYPE_UINT32:
    case FieldDescriptorProto_Type.TYPE_SINT32:
    case FieldDescriptorProto_Type.TYPE_FIXED32:
    case FieldDescriptorProto_Type.TYPE_SFIXED32:
      return numericDefaultVal;
    case FieldDescriptorProto_Type.TYPE_ENUM:
      // proto3 enforces enums starting at 0, however proto2 does not, so we have
      // to probe and see if zero is an allowed value. If it's not, pick the first one.
      // This is probably not great, but it's only used in fromJSON and fromPartial,
      // and I believe the semantics of those in the proto2 world are generally undefined.
      const typeInfo = typeMap.get(field.typeName)!;
      const enumProto = typeInfo[2] as EnumDescriptorProto;
      const defaultEnum =
        enumProto.value.find((v) => (useDefaultValue ? v.name === field.defaultValue : v.number === 0)) ||
        enumProto.value[0];
      return defaultEnum.number;

    case FieldDescriptorProto_Type.TYPE_INT64:
    case FieldDescriptorProto_Type.TYPE_UINT64:
    case FieldDescriptorProto_Type.TYPE_FIXED64:
    case FieldDescriptorProto_Type.TYPE_SINT64:
    case FieldDescriptorProto_Type.TYPE_SFIXED64:
      return numericDefaultVal;
    case FieldDescriptorProto_Type.TYPE_BOOL:
      return useDefaultValue ? field.defaultValue : false;
    case FieldDescriptorProto_Type.TYPE_STRING:
      return useDefaultValue ? `"${field.defaultValue}"` : '""';
    case FieldDescriptorProto_Type.TYPE_BYTES:
      return "new Uint8Array(0)";
    case FieldDescriptorProto_Type.TYPE_MESSAGE:
    case FieldDescriptorProto_Type.TYPE_GROUP:
    default:
      return "undefined";
  }
}

/** Creates code that checks that the field is not the default value. Supports scalars and enums. */
export function notDefaultCheck(
  ctx: BaseContext,
  field: FieldDescriptorProto,
  messageOptions: MessageOptions | undefined,
  place: string,
): Code {
  const { typeMap } = ctx;

  const maybeNotUndefinedAnd = field.proto3Optional ? `${place} !== undefined &&` : "";

  switch (field.type) {
    case FieldDescriptorProto_Type.TYPE_DOUBLE:
    case FieldDescriptorProto_Type.TYPE_FLOAT:
    case FieldDescriptorProto_Type.TYPE_INT32:
    case FieldDescriptorProto_Type.TYPE_UINT32:
    case FieldDescriptorProto_Type.TYPE_SINT32:
    case FieldDescriptorProto_Type.TYPE_FIXED32:
    case FieldDescriptorProto_Type.TYPE_SFIXED32:
    case FieldDescriptorProto_Type.TYPE_BOOL:
    case FieldDescriptorProto_Type.TYPE_STRING:
      return code`${maybeNotUndefinedAnd} ${place} !== ${defaultValue(ctx, field)}`;
    case FieldDescriptorProto_Type.TYPE_ENUM:
      // proto3 enforces enums starting at 0, however proto2 does not, so we have
      // to probe and see if zero is an allowed value. If it's not, pick the first one.
      // This is probably not great, but it's only used in fromJSON and fromPartial,
      // and I believe the semantics of those in the proto2 world are generally undefined.
      const typeInfo = typeMap.get(field.typeName)!;
      const enumProto = typeInfo[2] as EnumDescriptorProto;
      const defaultEnum = enumProto.value.find((v) => v.number === defaultValue(ctx, field)) || enumProto.value[0];
      // if (options.stringEnums) {
      //   const enumType = messageToTypeName(ctx, field.typeName);
      //   const enumValue = getEnumMemberName(ctx, enumProto, defaultEnum);
      //   return code`${maybeNotUndefinedAnd} ${place} !== ${enumType}.${enumValue}`;
      // } else {
      return code`${maybeNotUndefinedAnd} ${place} !== ${defaultEnum.number}`;
    // }
    case FieldDescriptorProto_Type.TYPE_UINT64:
    case FieldDescriptorProto_Type.TYPE_FIXED64:
    case FieldDescriptorProto_Type.TYPE_INT64:
    case FieldDescriptorProto_Type.TYPE_SINT64:
    case FieldDescriptorProto_Type.TYPE_SFIXED64:
      return code`${maybeNotUndefinedAnd} ${place} !== ${defaultValue(ctx, field)}`;
    case FieldDescriptorProto_Type.TYPE_BYTES:
      // todo(proto2): need to look into all the possible default values for the bytes type, and handle each one
      return code`${maybeNotUndefinedAnd} ${place}.length !== 0`;
    default:
      throw new Error("Not implemented for the given type.");
  }
}

/** A map of proto type name, e.g. `foo.Message.Inner`, to module/class name, e.g. `foo`, `Message_Inner`. */
export type TypeMap = Map<string, [string, string, DescriptorProto | EnumDescriptorProto]>;

/** Scans all of the proto files in `request` and builds a map of proto typeName -> TS module/name. */
export function createTypeMap(request: CodeGeneratorRequest): TypeMap {
  const typeMap: TypeMap = new Map();
  for (const file of request.protoFile) {
    // We assume a file.name of google/protobuf/wrappers.proto --> a module path of google/protobuf/wrapper.ts
    const moduleName = file.name.replace(".proto", "");
    // So given a fullName like FooMessage_InnerMessage, proto will see that as package.name.FooMessage.InnerMessage
    function saveMapping(
      tsFullName: string,
      desc: DescriptorProto | EnumDescriptorProto,
      s: SourceInfo,
      protoFullName: string,
    ): void {
      // package is optional, but make sure we have a dot-prefixed type name either way
      const prefix = file.package.length === 0 ? "" : `.${file.package}`;
      typeMap.set(`${prefix}.${protoFullName}`, [moduleName, tsFullName, desc]);
    }
    visit(file, SourceInfo.empty(), saveMapping, saveMapping);
  }
  return typeMap;
}

/** A "Scalar Value Type" as defined in https://developers.google.com/protocol-buffers/docs/proto3#scalar */
export function isScalar(field: FieldDescriptorProto): boolean {
  const scalarTypes = [
    FieldDescriptorProto_Type.TYPE_DOUBLE,
    FieldDescriptorProto_Type.TYPE_FLOAT,
    FieldDescriptorProto_Type.TYPE_INT32,
    FieldDescriptorProto_Type.TYPE_INT64,
    FieldDescriptorProto_Type.TYPE_UINT32,
    FieldDescriptorProto_Type.TYPE_UINT64,
    FieldDescriptorProto_Type.TYPE_SINT32,
    FieldDescriptorProto_Type.TYPE_SINT64,
    FieldDescriptorProto_Type.TYPE_FIXED32,
    FieldDescriptorProto_Type.TYPE_FIXED64,
    FieldDescriptorProto_Type.TYPE_SFIXED32,
    FieldDescriptorProto_Type.TYPE_SFIXED64,
    FieldDescriptorProto_Type.TYPE_BOOL,
    FieldDescriptorProto_Type.TYPE_STRING,
    FieldDescriptorProto_Type.TYPE_BYTES,
  ];
  return scalarTypes.includes(field.type);
}
export function isOptionalProperty(field: FieldDescriptorProto): boolean {
  return field.proto3Optional;
}

/** This includes all scalars, enums and the [groups type](https://developers.google.com/protocol-buffers/docs/reference/java/com/google/protobuf/DescriptorProtos.FieldDescriptorProto.Type.html#TYPE_GROUP) */
export function isPrimitive(field: FieldDescriptorProto): boolean {
  return !isMessage(field);
}

export function isBytes(field: FieldDescriptorProto): boolean {
  return field.type === FieldDescriptorProto_Type.TYPE_BYTES;
}

export function isMessage(field: FieldDescriptorProto): boolean {
  return field.type === FieldDescriptorProto_Type.TYPE_MESSAGE || field.type === FieldDescriptorProto_Type.TYPE_GROUP;
}

export function isEnum(field: FieldDescriptorProto): boolean {
  return field.type === FieldDescriptorProto_Type.TYPE_ENUM;
}

export function isWithinOneOf(field: FieldDescriptorProto): boolean {
  return field.hasOwnProperty("oneofIndex");
}

export function isRepeated(field: FieldDescriptorProto): boolean {
  return field.label === FieldDescriptorProto_Label.LABEL_REPEATED;
}

export function isLong(field: FieldDescriptorProto): boolean {
  return basicLongWireType(field.type) !== undefined;
}

export function isWholeNumber(field: FieldDescriptorProto): boolean {
  return (
    field.type === FieldDescriptorProto_Type.TYPE_INT32 ||
    field.type === FieldDescriptorProto_Type.TYPE_INT64 ||
    field.type === FieldDescriptorProto_Type.TYPE_UINT32 ||
    field.type === FieldDescriptorProto_Type.TYPE_UINT64 ||
    field.type === FieldDescriptorProto_Type.TYPE_SINT32 ||
    field.type === FieldDescriptorProto_Type.TYPE_SINT64 ||
    field.type === FieldDescriptorProto_Type.TYPE_FIXED32 ||
    field.type === FieldDescriptorProto_Type.TYPE_FIXED64 ||
    field.type === FieldDescriptorProto_Type.TYPE_SFIXED32 ||
    field.type === FieldDescriptorProto_Type.TYPE_SFIXED64
  );
}

export function isMapType(ctx: BaseContext, messageDesc: DescriptorProto, field: FieldDescriptorProto): boolean {
  return detectMapType(ctx, messageDesc, field) !== undefined;
}

export function isTimestamp(field: FieldDescriptorProto): boolean {
  return field.typeName === ".google.protobuf.Timestamp";
}

export function isValueType(ctx: BaseContext, field: FieldDescriptorProto): boolean {
  return valueTypeName(ctx, field.typeName) !== undefined;
}

export function isAnyValueType(field: FieldDescriptorProto): boolean {
  return isAnyValueTypeName(field.typeName);
}

export function isAnyValueTypeName(typeName: string): boolean {
  return typeName === "google.protobuf.Value" || typeName === ".google.protobuf.Value";
}

export function isBytesValueType(field: FieldDescriptorProto): boolean {
  return field.typeName === ".google.protobuf.BytesValue";
}

export function isFieldMaskType(field: FieldDescriptorProto): boolean {
  return isFieldMaskTypeName(field.typeName);
}

export function isFieldMaskTypeName(typeName: string): boolean {
  return typeName === "google.protobuf.FieldMask" || typeName === ".google.protobuf.FieldMask";
}

export function isListValueType(field: FieldDescriptorProto): boolean {
  return isListValueTypeName(field.typeName);
}

export function isListValueTypeName(typeName: string): boolean {
  return typeName === "google.protobuf.ListValue" || typeName === ".google.protobuf.ListValue";
}

export function isStructType(field: FieldDescriptorProto): boolean {
  return isStructTypeName(field.typeName);
}

export function isStructTypeName(typeName: string): boolean {
  return typeName === "google.protobuf.Struct" || typeName === ".google.protobuf.Struct";
}

export function valueTypeName(ctx: BaseContext, typeName: string): Code | undefined {
  switch (typeName) {
    case ".google.protobuf.StringValue":
      return code`string`;
    case ".google.protobuf.Int32Value":
    case ".google.protobuf.UInt32Value":
    case ".google.protobuf.DoubleValue":
    case ".google.protobuf.FloatValue":
      return code`number`;
    case ".google.protobuf.Int64Value":
    case ".google.protobuf.UInt64Value":
      return longTypeName();
    case ".google.protobuf.BoolValue":
      return code`boolean`;
    case ".google.protobuf.BytesValue":
      return code`Uint8Array`;
    case ".google.protobuf.ListValue":
      return code`Array<any>`;
    case ".google.protobuf.Value":
      return code`any`;
    case ".google.protobuf.Struct":
      return code`{[key: string]: any}`;
    case ".google.protobuf.FieldMask":
      return code`string[]`;
    case ".google.protobuf.Duration":
      return undefined;
    case ".google.protobuf.Timestamp":
      return undefined;
    default:
      return undefined;
  }
}

function longTypeName(): Code {
  return code`number`;
}

/** Maps `.some_proto_namespace.Message` to a TypeName. */
export function messageToTypeName(
  ctx: BaseContext,
  protoType: string,
  typeOptions: { keepValueType?: boolean; repeated?: boolean } = {},
): Code {
  const { typeMap } = ctx;
  // Watch for the wrapper types `.google.protobuf.*Value`. If we're mapping
  // them to basic built-in types, we union the type with undefined to
  // indicate the value is optional. Exceptions:
  // - If the field is repeated, values cannot be undefined.
  let valueType = valueTypeName(ctx, protoType);
  if (!typeOptions.keepValueType && valueType) {
    if (typeOptions.repeated ?? false) {
      return valueType;
    }
    return code`${valueType} | "undefined"`;
  }
  // Look for other special prototypes like Timestamp that aren't technically wrapper types
  if (!typeOptions.keepValueType && protoType === ".google.protobuf.Timestamp") {
    return code`Date`;
  }

  const [module, type] = toModuleAndType(typeMap, protoType);
  return code`${impProto(module, type)}`;
}

/** Breaks `.some_proto_namespace.Some.Message` into `['some_proto_namespace', 'Some_Message', Descriptor]. */
function toModuleAndType(typeMap: TypeMap, protoType: string): [string, string, DescriptorProto | EnumDescriptorProto] {
  return typeMap.get(protoType) || fail(`No type found for ${protoType}`);
}

export function getEnumMethod(ctx: BaseContext, enumProtoType: string, methodSuffix: string): Import {
  const [module, type] = toModuleAndType(ctx.typeMap, enumProtoType);
  return impProto(module, `${uncapitalize(type)}${methodSuffix}`);
}

/** Return the TypeName for any field (primitive/message/etc.) as exposed in the interface. */
export function toTypeName(
  ctx: BaseContext,
  messageDesc: DescriptorProto | undefined,
  field: FieldDescriptorProto,
  ensureOptional = false,
): Code {
  function finalize(type: Code, isOptional: boolean) {
    if (isOptional) {
      return code`${type} | undefined`;
    }
    return type;
  }

  const fieldType = field.type;

  const type = basicTypeName(ctx, { ...field, type: fieldType }, { keepValueType: false });

  if (isRepeated(field)) {
    const mapType = messageDesc ? detectMapType(ctx, messageDesc, field) : false;
    if (mapType) {
      const { keyType, valueType } = mapType;
      return finalize(code`Map<${keyType}, ${valueType}>`, ensureOptional);
    }
    return finalize(code`${type}[]`, ensureOptional);
  }

  if (isValueType(ctx, field)) {
    // google.protobuf.*Value types are already unioned with `undefined`
    // in messageToTypeName, so no need to consider them for that here.
    return finalize(type, false);
  }

  // By default (useOptionals='none', oneof=properties), non-scalar fields
  // outside oneofs and all fields within a oneof clause need to be unioned
  // with `undefined` to indicate the value is optional.
  //
  // When useOptionals='messages' or useOptionals='all', non-scalar fields are
  // translated to optional properties, so no need for the union with
  // `undefined` here.
  //
  // When oneof=unions, we generate a single property for the entire `oneof`
  // clause, spelling each option out inside a large type union. No need for
  // union with `undefined` here, either.
  return finalize(
    type,
    (!isWithinOneOf(field) && isMessage(field)) || (isWithinOneOf(field) && field.proto3Optional) || ensureOptional,
  );
}

export function detectMapType(
  ctx: BaseContext,
  messageDesc: DescriptorProto,
  fieldDesc: FieldDescriptorProto,
):
  | {
      messageDesc: DescriptorProto;
      keyField: FieldDescriptorProto;
      keyType: Code;
      valueField: FieldDescriptorProto;
      valueType: Code;
    }
  | undefined {
  const { typeMap } = ctx;
  if (
    fieldDesc.label === FieldDescriptorProto_Label.LABEL_REPEATED &&
    fieldDesc.type === FieldDescriptorProto_Type.TYPE_MESSAGE
  ) {
    const mapType = typeMap.get(fieldDesc.typeName)![2] as DescriptorProto;
    if (!mapType.options?.mapEntry) return undefined;
    const [keyField, valueField] = mapType.field;
    const keyType = toTypeName(ctx, messageDesc, keyField);
    // use basicTypeName because we don't need the '| undefined'
    const valueType = basicTypeName(ctx, valueField);
    return { messageDesc: mapType, keyField, keyType, valueField, valueType };
  }
  return undefined;
}

export function rawRequestType(
  ctx: BaseContext,
  methodDesc: MethodDescriptorProto,
  typeOptions: { keepValueType?: boolean; repeated?: boolean } = {},
): Code {
  return messageToTypeName(ctx, methodDesc.inputType, typeOptions);
}

export function observableType(ctx: BaseContext, asType: boolean = false): Code {
  // if (ctx.options.useAsyncIterable) {
  //   return code`AsyncIterable`;
  if (asType) {
    return code`${imp("t:Observable@rxjs")}`;
  } else {
    return code`${imp("Observable@rxjs")}`;
  }
}

export function requestType(ctx: BaseContext, methodDesc: MethodDescriptorProto): Code {
  let typeName = rawRequestType(ctx, methodDesc, { keepValueType: true });

  if (methodDesc.clientStreaming) {
    return code`${observableType(ctx)}<${typeName}>`;
  }
  return typeName;
}

export function responseType(ctx: BaseContext, methodDesc: MethodDescriptorProto): Code {
  return messageToTypeName(ctx, methodDesc.outputType, { keepValueType: true });
}

export function responsePromise(ctx: BaseContext, methodDesc: MethodDescriptorProto): Code {
  return code`Promise<${responseType(ctx, methodDesc)}>`;
}

export function responseObservable(ctx: BaseContext, methodDesc: MethodDescriptorProto): Code {
  return code`${observableType(ctx)}<${responseType(ctx, methodDesc)}>`;
}

export function responsePromiseOrObservable(ctx: BaseContext, methodDesc: MethodDescriptorProto): Code {
  if (methodDesc.serverStreaming) {
    return responseObservable(ctx, methodDesc);
  }
  return responsePromise(ctx, methodDesc);
}
