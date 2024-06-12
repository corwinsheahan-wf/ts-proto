// Code generated by protoc-gen-ts_proto. DO NOT EDIT.
// source: proto-3.proto

/* eslint-disable */
import * as _m0 from "protobufjs/minimal";

export const protobufPackage = "omit";

export interface Proto3TestMessage {
  boolValue?: boolean | undefined;
  intValue?: number | undefined;
  stringValue?: string | undefined;
  optionalBoolValue?: boolean | undefined;
  optionalIntValue?: number | undefined;
  optionalStringValue?: string | undefined;
  mapValue: { [key: string]: string };
}

export interface Proto3TestMessage_MapValueEntry {
  key?: string | undefined;
  value?: string | undefined;
}

function createBaseProto3TestMessage(): Proto3TestMessage {
  return {
    boolValue: undefined,
    intValue: undefined,
    stringValue: undefined,
    optionalBoolValue: undefined,
    optionalIntValue: undefined,
    optionalStringValue: undefined,
    mapValue: {},
  };
}

export const Proto3TestMessage = {
  encode(message: Proto3TestMessage, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.boolValue !== undefined) {
      writer.uint32(8).bool(message.boolValue);
    }
    if (message.intValue !== undefined) {
      writer.uint32(16).int32(message.intValue);
    }
    if (message.stringValue !== undefined) {
      writer.uint32(26).string(message.stringValue);
    }
    if (message.optionalBoolValue !== undefined) {
      writer.uint32(32).bool(message.optionalBoolValue);
    }
    if (message.optionalIntValue !== undefined) {
      writer.uint32(40).int32(message.optionalIntValue);
    }
    if (message.optionalStringValue !== undefined) {
      writer.uint32(50).string(message.optionalStringValue);
    }
    Object.entries(message.mapValue).forEach(([key, value]) => {
      Proto3TestMessage_MapValueEntry.encode({ key: key as any, value }, writer.uint32(58).fork()).ldelim();
    });
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Proto3TestMessage {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseProto3TestMessage();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 8) {
            break;
          }

          message.boolValue = reader.bool();
          continue;
        case 2:
          if (tag !== 16) {
            break;
          }

          message.intValue = reader.int32();
          continue;
        case 3:
          if (tag !== 26) {
            break;
          }

          message.stringValue = reader.string();
          continue;
        case 4:
          if (tag !== 32) {
            break;
          }

          message.optionalBoolValue = reader.bool();
          continue;
        case 5:
          if (tag !== 40) {
            break;
          }

          message.optionalIntValue = reader.int32();
          continue;
        case 6:
          if (tag !== 50) {
            break;
          }

          message.optionalStringValue = reader.string();
          continue;
        case 7:
          if (tag !== 58) {
            break;
          }

          const entry7 = Proto3TestMessage_MapValueEntry.decode(reader, reader.uint32());
          if (entry7.value !== undefined && entry7.key !== undefined) {
            message.mapValue[entry7.key] = entry7.value;
          }
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): Proto3TestMessage {
    return {
      boolValue: isSet(object.boolValue) ? globalThis.Boolean(object.boolValue) : undefined,
      intValue: isSet(object.intValue) ? globalThis.Number(object.intValue) : undefined,
      stringValue: isSet(object.stringValue) ? globalThis.String(object.stringValue) : undefined,
      optionalBoolValue: isSet(object.optionalBoolValue) ? globalThis.Boolean(object.optionalBoolValue) : undefined,
      optionalIntValue: isSet(object.optionalIntValue) ? globalThis.Number(object.optionalIntValue) : undefined,
      optionalStringValue: isSet(object.optionalStringValue)
        ? globalThis.String(object.optionalStringValue)
        : undefined,
      mapValue: isObject(object.mapValue)
        ? Object.entries(object.mapValue).reduce<{ [key: string]: string }>((acc, [key, value]) => {
          acc[key] = String(value);
          return acc;
        }, {})
        : {},
    };
  },

  toJSON(message: Proto3TestMessage): unknown {
    const obj: any = {};
    if (message.boolValue !== undefined) {
      obj.boolValue = message.boolValue;
    }
    if (message.intValue !== undefined) {
      obj.intValue = Math.round(message.intValue);
    }
    if (message.stringValue !== undefined) {
      obj.stringValue = message.stringValue;
    }
    if (message.optionalBoolValue !== undefined) {
      obj.optionalBoolValue = message.optionalBoolValue;
    }
    if (message.optionalIntValue !== undefined) {
      obj.optionalIntValue = Math.round(message.optionalIntValue);
    }
    if (message.optionalStringValue !== undefined) {
      obj.optionalStringValue = message.optionalStringValue;
    }
    if (message.mapValue) {
      const entries = Object.entries(message.mapValue);
      if (entries.length > 0) {
        obj.mapValue = {};
        entries.forEach(([k, v]) => {
          obj.mapValue[k] = v;
        });
      }
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<Proto3TestMessage>, I>>(base?: I): Proto3TestMessage {
    return Proto3TestMessage.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<Proto3TestMessage>, I>>(object: I): Proto3TestMessage {
    const message = createBaseProto3TestMessage();
    message.boolValue = object.boolValue ?? undefined;
    message.intValue = object.intValue ?? undefined;
    message.stringValue = object.stringValue ?? undefined;
    message.optionalBoolValue = object.optionalBoolValue ?? undefined;
    message.optionalIntValue = object.optionalIntValue ?? undefined;
    message.optionalStringValue = object.optionalStringValue ?? undefined;
    message.mapValue = Object.entries(object.mapValue ?? {}).reduce<{ [key: string]: string }>((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = globalThis.String(value);
      }
      return acc;
    }, {});
    return message;
  },
};

function createBaseProto3TestMessage_MapValueEntry(): Proto3TestMessage_MapValueEntry {
  return { key: undefined, value: undefined };
}

export const Proto3TestMessage_MapValueEntry = {
  encode(message: Proto3TestMessage_MapValueEntry, writer: _m0.Writer = _m0.Writer.create()): _m0.Writer {
    if (message.key !== undefined) {
      writer.uint32(10).string(message.key);
    }
    if (message.value !== undefined) {
      writer.uint32(18).string(message.value);
    }
    return writer;
  },

  decode(input: _m0.Reader | Uint8Array, length?: number): Proto3TestMessage_MapValueEntry {
    const reader = input instanceof _m0.Reader ? input : _m0.Reader.create(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseProto3TestMessage_MapValueEntry();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1:
          if (tag !== 10) {
            break;
          }

          message.key = reader.string();
          continue;
        case 2:
          if (tag !== 18) {
            break;
          }

          message.value = reader.string();
          continue;
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skipType(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): Proto3TestMessage_MapValueEntry {
    return {
      key: isSet(object.key) ? globalThis.String(object.key) : undefined,
      value: isSet(object.value) ? globalThis.String(object.value) : undefined,
    };
  },

  toJSON(message: Proto3TestMessage_MapValueEntry): unknown {
    const obj: any = {};
    if (message.key !== undefined) {
      obj.key = message.key;
    }
    if (message.value !== undefined) {
      obj.value = message.value;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<Proto3TestMessage_MapValueEntry>, I>>(base?: I): Proto3TestMessage_MapValueEntry {
    return Proto3TestMessage_MapValueEntry.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<Proto3TestMessage_MapValueEntry>, I>>(
    object: I,
  ): Proto3TestMessage_MapValueEntry {
    const message = createBaseProto3TestMessage_MapValueEntry();
    message.key = object.key ?? undefined;
    message.value = object.value ?? undefined;
    return message;
  },
};

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin ? T
  : T extends globalThis.Array<infer U> ? globalThis.Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
  : T extends {} ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

function isObject(value: any): boolean {
  return typeof value === "object" && value !== null;
}

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}