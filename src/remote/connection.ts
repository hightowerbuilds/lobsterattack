import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { remoteTopic, type Agent } from "../../supabase/functions/_shared/agents.ts";
import { visiblePoll } from "./poll.ts";
import type { Approval, Message } from "./types.ts";

export type ChannelState = "joining" | "joined" | "down";

export function connect(client: SupabaseClient, owner: string, agent: Agent, handlers: {
  load(): Promise<void>;
  message(message: Message): void;
  approval(approval: Approval): void;
  live(id: string, field: "text" | "status", text: string): void;
  online(value: boolean): void;
  state(value: ChannelState): void;
}) {
  let channel: RealtimeChannel | undefined;
  let gone = false;
  const poll = visiblePoll(handlers.load, 5000);
  void client.realtime.setAuth().then(() => {
    if (gone) return;
    channel = client.channel(remoteTopic(owner, agent), { config: { private: true } });
    channel
      .on("broadcast", { event: "message" }, ({ payload }) => { if (!gone) handlers.message(payload as Message); })
      .on("broadcast", { event: "approval" }, ({ payload }) => { if (!gone && agent === "tiny-axe") handlers.approval(payload as Approval); })
      .on("broadcast", { event: "draft" }, ({ payload }) => { if (!gone) handlers.live(payload.reply_to, "text", payload.text); })
      .on("broadcast", { event: "status" }, ({ payload }) => { if (!gone) handlers.live(payload.reply_to, "status", payload.text); })
      .on("broadcast", { event: "device" }, ({ payload }) => { if (!gone && agent === "busterclaw") handlers.online(payload.online === true); })
      .on("presence", { event: "sync" }, () => { if (!gone && agent === "tiny-axe") handlers.online("tiny-axe" in channel!.presenceState()); })
      .subscribe(status => {
        if (gone) return;
        if (status === "SUBSCRIBED") {
          handlers.state("joined");
          void poll.refresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          handlers.state("down");
          handlers.online(false);
        }
      });
  }).catch(() => { if (!gone) handlers.state("down"); });

  return () => {
    gone = true;
    poll.stop();
    if (channel) void client.removeChannel(channel);
  };
}
