"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  pickRandomLineConversationExample,
  pickRandomLineConversationExampleExcept,
} from "../lib/lineConversationExamples";

type Props = {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  className?: string;
};

const TYPING_DELAY_MS = 38;
const NEWLINE_DELAY_MS = 320;
const PAUSE_AFTER_COMPLETE_MS = 1800;
const CURSOR_BLINK_MS = 530;

export function LineConversationInput({
  value,
  onChange,
  style,
  className = "crm-line-conversation-textarea",
}: Props) {
  const [focused, setFocused] = useState(false);
  const [demoText, setDemoText] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);

  const charIndexRef = useRef(0);
  const conversationRef = useRef(pickRandomLineConversationExample());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEmpty = value.trim().length === 0;
  const showDemo = isEmpty && !focused;

  const clearTimer = () => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  useEffect(() => {
    if (!showDemo) {
      setCursorVisible(true);
      return;
    }

    const intervalId = window.setInterval(() => {
      setCursorVisible((visible) => !visible);
    }, CURSOR_BLINK_MS);

    return () => window.clearInterval(intervalId);
  }, [showDemo]);

  useEffect(() => {
    if (!showDemo) {
      clearTimer();
      charIndexRef.current = 0;
      setDemoText("");
      return;
    }

    charIndexRef.current = 0;
    setDemoText("");
    conversationRef.current = pickRandomLineConversationExample();

    const schedule = (fn: () => void, delayMs: number) => {
      clearTimer();
      timeoutRef.current = setTimeout(fn, delayMs);
    };

    const typeNextCharacter = () => {
      const fullText = conversationRef.current;
      const index = charIndexRef.current;

      if (index >= fullText.length) {
        schedule(() => {
          conversationRef.current = pickRandomLineConversationExampleExcept(
            conversationRef.current,
          );
          charIndexRef.current = 0;
          setDemoText("");
          schedule(typeNextCharacter, TYPING_DELAY_MS);
        }, PAUSE_AFTER_COMPLETE_MS);
        return;
      }

      const nextIndex = index + 1;
      charIndexRef.current = nextIndex;
      setDemoText(fullText.slice(0, nextIndex));

      const typedChar = fullText[nextIndex - 1];
      const delay = typedChar === "\n" ? NEWLINE_DELAY_MS : TYPING_DELAY_MS;
      schedule(typeNextCharacter, delay);
    };

    schedule(typeNextCharacter, TYPING_DELAY_MS);

    return () => {
      clearTimer();
    };
  }, [showDemo]);

  return (
    <div style={{ position: "relative", width: "100%", boxSizing: "border-box" }}>
      <textarea
        className={className}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="載入客戶對話資料"
        style={{
          ...style,
          width: "100%",
          boxSizing: "border-box",
          color: showDemo ? "transparent" : style?.color ?? "#ffffff",
          caretColor: "#ffffff",
          WebkitTextFillColor: showDemo ? "transparent" : undefined,
        }}
      />
      {showDemo ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            padding: style?.padding ?? 16,
            pointerEvents: "none",
            color: "#94a3b8",
            fontSize: style?.fontSize ?? 18,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          {demoText}
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: "1em",
              marginLeft: 1,
              verticalAlign: "text-bottom",
              backgroundColor: cursorVisible ? "#94a3b8" : "transparent",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
