import { MethodDescriptorProto, FileDescriptorProto, ServiceDescriptorProto } from "ts-proto-descriptors";
import { Code, code, def, joinCode } from "ts-poet";
import {
  requestType,
  rawRequestType,
  responsePromiseOrObservable,
  responseType,
  observableType,
} from "./types";
import {
  assertInstanceOf,
  FormattedMethodDescriptor,
  impFile,
  addComment,
  maybePrefixPackage,
} from "./utils";
import SourceInfo, { Fields } from "./sourceInfo";
import { Context } from "./context";

/**
 * Generates an interface for `serviceDesc`.
 *
**/ 
export function generateService(
  ctx: Context,
  fileDesc: FileDescriptorProto,
  sourceInfo: SourceInfo,
  serviceDesc: ServiceDescriptorProto,
): Code {
  const { options } = ctx;
  const chunks: Code[] = [];

  addComment(sourceInfo, chunks, serviceDesc.options?.deprecated);
  chunks.push(code`export interface ${def(serviceDesc.name)} {`);

  serviceDesc.method.forEach((methodDesc, index) => {
    assertInstanceOf(methodDesc, FormattedMethodDescriptor);
    const info = sourceInfo.lookup(Fields.service.method, index);
    addComment(info, chunks, methodDesc.options?.deprecated);

    const params: Code[] = [];
    
    // the grpc-web clients auto-`fromPartial` the input before handing off to grpc-web's
    // serde runtime, so it's okay to accept partial results from the client
    const inputType = requestType(ctx, methodDesc);
    params.push(code`request: ${inputType}`);
   
    chunks.push(
      code`${methodDesc.formattedName}(${joinCode(params, { on: "," })}): ${responsePromiseOrObservable(
        ctx,
        methodDesc,
      )};`,
    );
  });

  chunks.push(code`}`);

  return joinCode(chunks, { on: "\n" });
}

function generateRegularRpcMethod(ctx: Context, methodDesc: MethodDescriptorProto): Code {
  assertInstanceOf(methodDesc, FormattedMethodDescriptor);
  const rawInputType = rawRequestType(ctx, methodDesc, { keepValueType: true });
  const inputType = requestType(ctx, methodDesc);

  const params = [code`request: ${inputType}`];

  let rpcMethod: string;
  if (methodDesc.clientStreaming && methodDesc.serverStreaming) {
    rpcMethod = "bidirectionalStreamingRequest";
  } else if (methodDesc.serverStreaming) {
    rpcMethod = "serverStreamingRequest";
  } else if (methodDesc.clientStreaming) {
    rpcMethod = "clientStreamingRequest";
  } else {
    rpcMethod = "request";
  }
  rpcMethod = `this.rpc.${rpcMethod}`;
  const service = "this.service";

  function generateGenericRpcBody(): Code {
    let beforeRequest = code``;
    let requestParamName = "request";

    let requestInvocation = code`${rpcMethod}<${rawInputType},${responseType(ctx, methodDesc, {
      keepValueType: true,
    })}>(
          ${service},
          "${methodDesc.name}",
          ${requestParamName},
          ${rawInputType},
          ${responseType(ctx, methodDesc, { keepValueType: true })})`;

    requestInvocation = code`return ${requestInvocation}`;
    
    return code`${beforeRequest}
        ${requestInvocation}`;
  }

  const body = generateGenericRpcBody();
  return code`
    ${methodDesc.formattedName}(
      ${joinCode(params, { on: "," })}
    ): ${responsePromiseOrObservable(ctx, methodDesc)} {
      ${body}
    }
  `;
}

export function generateServiceClientImpl(
  ctx: Context,
  fileDesc: FileDescriptorProto,
  serviceDesc: ServiceDescriptorProto,
): Code {
  const { options } = ctx;
  const chunks: Code[] = [];

  // Determine information about the service.
  const { name } = serviceDesc;
  const serviceName = maybePrefixPackage(fileDesc, serviceDesc.name);

  // Define the service name constant.
  const serviceNameConst = `${name}ServiceName`;
  chunks.push(code`export const ${serviceNameConst} = "${serviceName}";`);

  // Define the FooServiceImpl class
  const i = options.context ? `${name}<Context>` : name;
  chunks.push(code`export class ${name}ClientImpl implements ${def(i)} {`);

  // Create the constructor(rpc: Rpc)
  const rpcType = options.context ? "Rpc<Context>" : "Rpc";
  chunks.push(code`private readonly rpc: ${rpcType};`);
  chunks.push(code`private readonly service: string;`);
  chunks.push(code`constructor(rpc: ${rpcType}, opts?: {service?: string}) {`);
  chunks.push(code`this.service = opts?.service || ${serviceNameConst};`);
  chunks.push(code`this.rpc = rpc;`);

  // Bind each FooService method to the FooServiceImpl class
  for (const methodDesc of serviceDesc.method) {
    assertInstanceOf(methodDesc, FormattedMethodDescriptor);
    chunks.push(code`this.${methodDesc.formattedName} = this.${methodDesc.formattedName}.bind(this);`);
  }
  chunks.push(code`}`);

  // Create a method for each FooService method
  for (const methodDesc of serviceDesc.method) {
      chunks.push(generateRegularRpcMethod(ctx, methodDesc));
  }

  chunks.push(code`}`);
  return code`${chunks}`;
}

/**
 * Creates an `Rpc.request(service, method, data)` abstraction.
 *
 * This lets clients pass in their own request-promise-ish client.
 *
 * This also requires clientStreamingRequest, serverStreamingRequest and
 * bidirectionalStreamingRequest methods if any of the RPCs is streaming.
 *
 * We don't export this because if a project uses multiple `*.proto` files,
 * we don't want our the barrel imports in `index.ts` to have multiple `Rpc`
 * types.
 */
export function generateRpcType(ctx: Context, hasStreamingMethods: boolean): Code {
  const { options } = ctx;
  const messageType = impFile(options, "MessageType@./typeRegistry");

  // const outputGenericClient = options.outputClientImpl === "generic";

  const maybeMessageTypeParams = code`reqType: ${messageType}, respType: ${messageType},`
  const maybeTypeParameters = "<Req, Res>";
  const requestType = "Req";
  const responseType = "Res";
  const requestParam = "request";

  const methods: Code[][] = [];
  methods.push([code`request${maybeTypeParameters}`, code`${requestType}`, code`Promise<${responseType}>`]);

  if (hasStreamingMethods) {
    const observable = observableType(ctx, true);
    methods.push([
      code`clientStreamingRequest${maybeTypeParameters}`,
      code`${observable}<${requestType}>`,
      code`Promise<${responseType}>`,
    ]);
    methods.push([
      code`serverStreamingRequest${maybeTypeParameters}`,
      code`${requestType}`,
      code`${observable}<${responseType}>`,
    ]);
    methods.push([
      code`bidirectionalStreamingRequest${maybeTypeParameters}`,
      code`${observable}<${requestType}>`,
      code`${observable}<${responseType}>`,
    ]);
  }

  const chunks: Code[] = [];
  chunks.push(code`    interface Rpc {`);
  methods.forEach((method) => {
    chunks.push(code`
      ${method[0]}(
        service: string,
        method: string,
        ${requestParam}: ${method[1]},
        ${maybeMessageTypeParams}
      ): ${method[2]};`);
  });
  chunks.push(code`    }`);
  return joinCode(chunks, { on: "\n" });
}
