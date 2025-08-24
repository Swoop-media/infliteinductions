// lib/teams/proactive.ts
import { ConversationReference, TurnContext } from "botbuilder";
import { adapter, botAppId } from "./botAdapter";

export async function sendProactive(conversationRef: any, text: string) {
  await adapter.continueConversation(
    botAppId,
    conversationRef as ConversationReference,
    async (context: TurnContext) => {
      await context.sendActivity(text);
    }
  );
}
