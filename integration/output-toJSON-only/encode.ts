// Code generated by protoc-gen-ts_proto. DO NOT EDIT.
// source: encode.proto

/* eslint-disable */

export const protobufPackage = "";

export interface Encode {
  encode: string;
}

export const Encode = {
  toJSON(message: Encode): unknown {
    const obj: any = {};
    if (message.encode !== "") {
      obj.encode = message.encode;
    }
    return obj;
  },
};
