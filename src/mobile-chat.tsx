import { createEffect, on } from "solid-js";
import { createAudio } from "./mobile/audio.ts";
import { createExpandedChat } from "./mobile/expanded.ts";

export function createMobileChat(props: {
  box: () => HTMLDivElement | undefined;
  input: () => HTMLTextAreaElement | undefined;
  scope: () => string;
  text: () => string;
  setText: (text: string) => void;
  reply: () => string;
  sending: () => boolean;
}) {
  const expanded = createExpandedChat({ box: props.box, stopAudio: () => audio.stopAudio() });
  const audio = createAudio({ ...props, mobile: expanded.mobile });
  createEffect(on(props.scope, audio.stopAudio, { defer: true }));
  createEffect(() => { if (props.sending()) audio.stopAudio(); });
  return { ...expanded, ...audio };
}
