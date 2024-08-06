import { code, Code, joinCode } from "ts-poet";
import { BaseContext } from "./context";

export function generateTypeRegistry(ctx: BaseContext): Code {
  const chunks: Code[] = [];

  chunks.push(generateMessageType(ctx));

    chunks.push(code`
    export type UnknownMessage = {$type: string};
  `);

  chunks.push(code`
    export const messageTypeRegistry = new Map<string, MessageType>();
  `);

  chunks.push(code` ${ctx.utils.Builtin.ifUsed} ${ctx.utils.DeepPartial.ifUsed}`);

  return joinCode(chunks, { on: "\n\n" });
}

function generateMessageType(ctx: BaseContext): Code {
  const chunks: Code[] = [];

  chunks.push(code`export interface MessageType<Message extends UnknownMessage = UnknownMessage> {`);

    chunks.push(code`$type: Message['$type'];`);

    chunks.push(code`fromJSON(object: any): Message;`);
    chunks.push(code`toJSON(message: Message): unknown;`);

    chunks.push(code`fromPartial(object: ${ctx.utils.DeepPartial}<Message>): Message;`);

  chunks.push(code`}`);

  return joinCode(chunks, { on: "\n" });
}
