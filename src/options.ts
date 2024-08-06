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

export enum EnvOption {
  NODE = "node",
  BROWSER = "browser",
  BOTH = "both",
}

export enum OneofOption {
  PROPERTIES = "properties",
  UNIONS = "unions",
}

export enum ServiceOption {
  GRPC = "grpc-js",
  NICE_GRPC = "nice-grpc",
  GENERIC = "generic-definitions",
  DEFAULT = "default",
  NONE = "none",
}

export type Options = {
  // Adds a context param to interfaces, could be useful at some point for things like tracing
  context: boolean;
  snakeToCamel: Array<"json" | "keys">;
  // TODO: Deterimine what we'd need here
  forceLong: LongOption;
  useJsTypeOverride: boolean;
  // globalThisPolyfill: boolean;  // false
  useOptionals: boolean | "none" | "deprecatedOnly" | "messages" | "all"; // boolean is deprecated
  emitDefaultValues: Array<"json-methods">;
  useDate: DateOption;
  useJsonTimestamp: JsonTimestampOption;
  // oneof: OneofOption;
  esModuleInterop: boolean;
  fileSuffix: string;
  importSuffix: string;
  // outputJsonMethods: true | false | "to-only" | "from-only"; // Default to both
  // outputPartialMethods: boolean; // Hopefully we can remove, but for now default to true
  // outputTypeAnnotations: boolean | "static-only" | "optional"; // Defualt to true, implied by outputTypeRegistry
  // outputTypeRegistry: boolean; // Default to tru for now, but maybe we can get rid of it entirely
  // stringEnums: boolean; // Don't think we need this, can be false. Description says for only types and grpc REST
  // constEnums: boolean; // No info about this, just stick with default
  // removeEnumPrefix: boolean;
  // enumsAsLiterals: boolean;
  // outputClientImpl: boolean | "grpc-web" | "generic";
  outputServices: ServiceOption[]; // defaults to generic-definitions
  // addGrpcMetadata: boolean;
  // metadataType: string | undefined; // TODO: Don't think we need this
  // addNestjsRestParameter: boolean;
  // returnObservable: boolean;
  // lowerCaseServiceMethods: boolean;
  // nestJs: boolean;
  // env: EnvOption;
  // TODO: Figure out if we need these 3, more detail/investigation needed
  unrecognizedEnum: boolean;
  unrecognizedEnumName: string;
  unrecognizedEnumValue: number;
  
  // exportCommonSymbols: boolean;
  // outputSchema: boolean | "no-file-descriptor";
  // onlyTypes: boolean;
  // emitImportedFiles: boolean;
  // useAbortSignal: boolean;
  // useExactTypes: boolean;
  // useAsyncIterable: boolean;
  // unknownFields: boolean;
  // usePrototypeForDefaults: boolean;
  useJsonName: boolean; // TODO: See about consistency with dart proto plugin
  useJsonWireFormat: boolean; // TODO: I think we might want this defaulted to true
  // useNumericEnumForJson: boolean;
  // initializeFieldsAsUndefined: boolean;
  useMapType: boolean; // TODO: We probably want this, but it's defualted to false
  // useReadonlyTypes: boolean;
  // useSnakeTypeName: boolean;
  // outputExtensions: boolean; // TODO: DO we want to enable extensions?
  // outputIndex: boolean;
  // M: { [from: string]: string };
  // rpcBeforeRequest: boolean;
  // rpcAfterResponse: boolean;
  // rpcErrorHandler: boolean;
  // comments: boolean;
  // disableProto2Optionals: boolean;
  // disableProto2DefaultValues: boolean;
  // useNullAsOptional: boolean;
  // annotateFilesWithVersion: boolean;
  // noDefaultsForOptionals: boolean;
};

export function defaultOptions(): Options {
  return {
    context: false,
    snakeToCamel: ["json", "keys"],
    emitDefaultValues: [],
    // globalThisPolyfill: false,
    forceLong: LongOption.NUMBER, // Probably default to `string`?
    useJsTypeOverride: false,
    useOptionals: "none", // Maybe will need this? 
    useDate: DateOption.DATE, // related to timestamps, not sure we'll need this at all
    useJsonTimestamp: JsonTimestampOption.RFC3339,
    // oneof: OneofOption.PROPERTIES, // We don't currently support oneof because the dart protobuf compiler doesn't
    esModuleInterop: false, // more investigation, tied to `importSuffix`
    fileSuffix: "",
    importSuffix: "", // probably can kebash and default to something like `.pb.`
    // lowerCaseServiceMethods: false,// Let's just default to true
    // outputEncodeMethods: true, // false
    // outputJsonMethods: true,
    // outputPartialMethods: true,
    // outputTypeAnnotations: false,
    // outputTypeRegistry: false,
    // stringEnums: false,
    // constEnums: false,
    // removeEnumPrefix: false,
    // enumsAsLiterals: false,
    // outputClientImpl: "generic",
    outputServices: [],
    // returnObservable: false,
    // addGrpcMetadata: false,
    // metadataType: undefined,
    // addNestjsRestParameter: false,
    // nestJs: false,
    // env: EnvOption.BOTH,
    unrecognizedEnum: true,
    unrecognizedEnumName: "UNRECOGNIZED",
    unrecognizedEnumValue: -1,
    // exportCommonSymbols: true,
    // outputSchema: false,
    // onlyTypes: false,
    // emitImportedFiles: true,
    // useExactTypes: true,
    // useAbortSignal: false,
    // useAsyncIterable: false,
    // unknownFields: false,
    // usePrototypeForDefaults: false,
    useJsonName: false,
    useJsonWireFormat: false,
    // useNumericEnumForJson: false,
    // initializeFieldsAsUndefined: true,
    useMapType: false,
    // useReadonlyTypes: false,
    // useSnakeTypeName: true,
    // outputExtensions: false,
    // outputIndex: false,
    // M: {},
    // rpcBeforeRequest: false,
    // rpcAfterResponse: false,
    // rpcErrorHandler: false,
    // comments: true,
    // disableProto2Optionals: false,
    // disableProto2DefaultValues: false,
    // useNullAsOptional: false,
    // annotateFilesWithVersion: true,
    // noDefaultsForOptionals: false,
  };
}

export function optionsFromParameter(parameter: string | undefined): Options {
  const options = defaultOptions();
  if (parameter) {
    const parsed = parseParameter(parameter);
    Object.assign(options, parsed);
  }

  // // onlyTypes=true implies outputJsonMethods=false,outputEncodeMethods=false,outputClientImpl=false,nestJs=false
  // if (options.onlyTypes) {
  //   // options.outputJsonMethods = false;
  //   // options.outputClientImpl = false;
  //   options.nestJs = false;
  // } else if (
  //   // !options.outputJsonMethods &&
  //   // !options.outputClientImpl &&
  //   !options.nestJs
  // ) {
  //   options.onlyTypes = true;
  // }

  // Treat forceLong=true as LONG
  if ((options.forceLong as any) === true) {
    options.forceLong = LongOption.LONG;
  }

  // Treat outputServices=false as NONE
  // if ((options.outputServices as any) === false) {
  //   options.outputServices = [ServiceOption.NONE];
  // }
  // Existing type-coercion inside parseParameter leaves a little to be desired.
  // if (typeof options.outputServices == "string") {
  //   options.outputServices = [options.outputServices];
  // }
  // Assume the user wants the default service output, unless they're using nestJs, which has
  // its own controllers output (although nestjs users can ask for other services too).
  // if (options.outputServices.length == 0 && !options.nestJs) {
  //   options.outputServices = [ServiceOption.DEFAULT];
  // }

  if ((options.useDate as any) === true) {
    // Treat useDate=true as DATE
    options.useDate = DateOption.DATE;
  } else if ((options.useDate as any) === false) {
    // Treat useDate=false as TIMESTAMP
    options.useDate = DateOption.TIMESTAMP;
  }

  if ((options.snakeToCamel as any) === false) {
    options.snakeToCamel = [];
  } else if ((options.snakeToCamel as any) === true) {
    options.snakeToCamel = ["keys", "json"];
  } else if (typeof options.snakeToCamel === "string") {
    options.snakeToCamel = (options.snakeToCamel as string).split("_") as any;
  }

  if ((options.emitDefaultValues as any) === "json-methods") {
    options.emitDefaultValues = ["json-methods"];
  } else {
    options.emitDefaultValues = [];
  }

  if (options.useJsonWireFormat) {
    // if (!options.onlyTypes) {
    //   // useJsonWireFormat requires onlyTypes=true
    //   options.useJsonWireFormat = false;
    // } else {
      // useJsonWireFormat implies stringEnums=true and useDate=string
      // options.stringEnums = true;
      options.useDate = DateOption.STRING;
    // }
  }

  // if (options.nestJs) {
  //   options.initializeFieldsAsUndefined = false;
  // }

  // if (options.outputIndex) {
  //   options.exportCommonSymbols = false;
  // }

  // if (options.rpcBeforeRequest || options.rpcAfterResponse || options.rpcErrorHandler) {
  //   const includesGeneric = options.outputServices.includes(ServiceOption.GENERIC);
  //   options.outputServices = [ServiceOption.DEFAULT];
  //   if (includesGeneric) {
  //     options.outputServices.push(ServiceOption.GENERIC);
  //   }
  // }

  if (options.unrecognizedEnumValue) {
    // Make sure to cast number options to an actual number
    options.unrecognizedEnumValue = Number(options.unrecognizedEnumValue);
  }

  // if (options.outputClientImpl === "generic") {
  //   // options.outputTypeRegistry = true;
  // }

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
//
// export function addTypeToMessages(options: Options): boolean {
//   return (
//     (options.outputTypeAnnotations || options.outputTypeRegistry) && options.outputTypeAnnotations !== "static-only"
//   );
// }
