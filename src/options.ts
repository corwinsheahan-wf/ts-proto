import { ToStringOpts } from "ts-poet/build/Code";

export enum LongOption {
  NUMBER = "number",
  LONG = "long",
  STRING = "string",
  BIGINT = "bigint",
}

export enum DateOption {
  DATE = "date",
  STRING = "string",
  STRING_NANO = "string-nano",
  TIMESTAMP = "timestamp",
}

export enum JsonTimestampOption {
  RFC3339 = "rfc3339",
  RAW = "raw",
}

export enum ServiceOption {
  GENERIC = "generic-definitions",
  DEFAULT = "default",
  NONE = "none",
}

export type Options = {
  // Adds a context param to interfaces, could be useful at some point for things like tracing
  context: boolean;
  // snakeToCamel: Array<"json" | "keys">;
  // TODO: Deterimine what we'd need here

  useJsTypeOverride: boolean;
  useOptionals: boolean | "none" | "deprecatedOnly" | "messages" | "all"; // boolean is deprecated
  emitDefaultValues: Array<"json-methods">;
  useDate: DateOption;
  useJsonTimestamp: JsonTimestampOption;
  esModuleInterop: boolean;
  fileSuffix: string;
  importSuffix: string;
  outputServices: ServiceOption[]; // defaults to generic-definitions
  // TODO: Figure out if we need these 3, more detail/investigation needed
  unrecognizedEnum: boolean;
  unrecognizedEnumName: string;
  unrecognizedEnumValue: number;

  useJsonName: boolean; // TODO: See about consistency with dart proto plugin
  useJsonWireFormat: boolean; // TODO: I think we might want this defaulted to true
  useMapType: boolean; // TODO: We probably want this, but it's defualted to false
};

export function defaultOptions(): Options {
  return {
    context: false,
    // snakeToCamel: ["json", "keys"],
    emitDefaultValues: [],
    useJsTypeOverride: false,
    useOptionals: "none", // Maybe will need this?
    useDate: DateOption.DATE, // related to timestamps, not sure we'll need this at all
    useJsonTimestamp: JsonTimestampOption.RFC3339,
    esModuleInterop: false, // more investigation, tied to `importSuffix`
    fileSuffix: "",
    importSuffix: "", // probably can kebash and default to something like `.pb.`
    outputServices: [],
    unrecognizedEnum: true,
    unrecognizedEnumName: "UNRECOGNIZED",
    unrecognizedEnumValue: -1,
    useJsonName: false,
    useJsonWireFormat: false,
    useMapType: false,
  };
}

export function optionsFromParameter(parameter: string | undefined): Options {
  const options = defaultOptions();
  if (parameter) {
    const parsed = parseParameter(parameter);
    Object.assign(options, parsed);
  }
  
  if ((options.useDate as any) === true) {
    // Treat useDate=true as DATE
    options.useDate = DateOption.DATE;
  } else if ((options.useDate as any) === false) {
    // Treat useDate=false as TIMESTAMP
    options.useDate = DateOption.TIMESTAMP;
  }

  // if ((options.snakeToCamel as any) === false) {
  //   options.snakeToCamel = [];
  // } else if ((options.snakeToCamel as any) === true) {
  //   options.snakeToCamel = ["keys", "json"];
  // } else if (typeof options.snakeToCamel === "string") {
  //   options.snakeToCamel = (options.snakeToCamel as string).split("_") as any;
  // }

  if ((options.emitDefaultValues as any) === "json-methods") {
    options.emitDefaultValues = ["json-methods"];
  } else {
    options.emitDefaultValues = [];
  }

  if (options.useJsonWireFormat) {
    options.useDate = DateOption.STRING;
  }

  if (options.unrecognizedEnumValue) {
    // Make sure to cast number options to an actual number
    options.unrecognizedEnumValue = Number(options.unrecognizedEnumValue);
  }

  return options;
}

// A very naive parse function, eventually could/should use iots/runtypes
function parseParameter(parameter: string): Options {
  const options = { M: {} } as any;
  parameter.split(",").forEach((param) => {
    // same as protoc-gen-go https://github.com/protocolbuffers/protobuf-go/blob/bf9455640daabb98c93b5b5e71628f3f813d57bb/compiler/protogen/protogen.go#L168-L171
    const optionSeparatorPos = param.indexOf("=");
    const key = param.substring(0, optionSeparatorPos);
    const value = parseParamValue(param.substring(optionSeparatorPos + 1));
    if (key.charAt(0) === "M") {
      if (typeof value !== "string") {
        console.warn(`ignoring invalid M option: '${param}'`);
      } else {
        const mKey = key.substring(1);
        if (options.M[mKey]) {
          console.warn(`received conflicting M options: '${param}' will override 'M${mKey}=${options.M[mKey]}'`);
        }
        if (param.endsWith(".ts")) {
          console.warn(`received M option '${param}' ending in '.ts' this is usually a mistake`);
        }
        options.M[mKey] = value;
      }
    } else if (options[key]) {
      options[key] = [options[key], value];
    } else {
      options[key] = value;
    }
  });
  return options;
}

function parseParamValue(value: string): string | boolean {
  return value === "true" ? true : value === "false" ? false : value;
}

export function getTsPoetOpts(
  options: Options,
  tsProtoVersion: string,
  protocVersion: string,
  fileName?: string,
): ToStringOpts {
  const { importSuffix, esModuleInterop } = options;
  const pbjs = "protobufjs/minimal" + importSuffix;

  return {
    // Comment block at the top of every source file, since these comments require specific
    // syntax incompatible with ts-poet, we will hard-code the string and prepend to the
    // generator output.
    prefix: `// Code generated by protoc-gen-ts_proto. DO NOT EDIT.
${fileName ? `// source: ${fileName}` : ""}

    /* eslint-disable */`,
    dprintOptions: { preferSingleLine: true, lineWidth: 120 },
    forceRequireImport: esModuleInterop ? [] : ["long"],
    forceDefaultImport: esModuleInterop ? [pbjs] : [],
    forceModuleImport: esModuleInterop ? [] : [pbjs],
  };
}
