"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import type { AppLang } from "../lib/appLang";
import { voiceInputCopy } from "../lib/followUpWorkspaceI18n";

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } };
};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() != null;
}

export function VoiceInputButton({
  lang,
  onAppend,
  disabled,
  size = "md",
  showRecordingLabel = false,
}: {
  lang: AppLang;
  onAppend: (text: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  showRecordingLabel?: boolean;
}) {
  const t = voiceInputCopy(lang);
  const [mounted, setMounted] = useState(false);
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const wantListenRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setUnsupported(true);
      return;
    }
    setUnsupported(false);
    wantListenRef.current = true;

    const rec = new Ctor();
    rec.lang = "zh-TW";
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
      let chunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) chunk += res[0]?.transcript ?? "";
      }
      if (chunk.trim()) onAppend(chunk);
    };

    rec.onerror = () => {
      wantListenRef.current = false;
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      if (wantListenRef.current && recRef.current) {
        try {
          recRef.current.start();
          setListening(true);
        } catch {
          wantListenRef.current = false;
        }
      }
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      wantListenRef.current = false;
      setListening(false);
    }
  }, [onAppend]);

  useEffect(() => {
    return () => {
      wantListenRef.current = false;
      recRef.current?.abort();
    };
  }, []);

  const btnSize = size === "sm" ? 36 : 44;
  const supported = mounted && isSpeechRecognitionSupported();

  if (mounted && !supported) {
    return (
      <span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.3, maxWidth: 120 }} title={t.unsupported}>
        {t.unsupported}
      </span>
    );
  }

  if (unsupported) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
      }}
    >
      {showRecordingLabel && listening ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#ef4444",
            whiteSpace: "nowrap",
          }}
        >
          {t.listening}
        </span>
      ) : null}
      <button
        type="button"
        title={listening ? t.stop : t.start}
        aria-label={listening ? t.stop : t.start}
        disabled={disabled || !mounted}
        onClick={() => (listening ? stop() : start())}
        style={{
          flexShrink: 0,
          width: btnSize,
          height: btnSize,
          borderRadius: 10,
          border: listening ? "2px solid #ef4444" : "1px solid rgba(255,255,255,0.25)",
          background: listening ? "rgba(127,29,29,0.75)" : "rgba(15,23,42,0.85)",
          color: "#fff",
          cursor: disabled || !mounted ? "not-allowed" : "pointer",
          fontSize: size === "sm" ? 16 : 20,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : mounted ? 1 : 0.6,
          boxShadow: listening ? "0 0 12px rgba(239,68,68,0.45)" : "0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        🎤
        {listening ? (
          <span
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#ef4444",
              boxShadow: "0 0 0 0 rgba(239,68,68,0.7)",
              animation: "voice-pulse 1.2s ease-out infinite",
            }}
          />
        ) : null}
        <style>{`
          @keyframes voice-pulse {
            0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.65); }
            70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
            100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
          }
        `}</style>
      </button>
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 8,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
};

function appendTranscript(current: string, chunk: string): string {
  const c = chunk.trim();
  if (!c) return current;
  if (!current.trim()) return c;
  const sep = /[\s，。！？、]$/.test(current) ? "" : " ";
  return current + sep + c;
}

/** LINE 對話貼上區專用：右下角語音按鈕。 */
export function LineChatTextareaWithVoice({
  lang,
  value,
  onChange,
  inputStyle,
  placeholder,
}: {
  lang: AppLang;
  value: string;
  onChange: (value: string) => void;
  inputStyle?: CSSProperties;
  placeholder?: string;
}) {
  return (
    <TextInputWithVoice
      lang={lang}
      multiline
      value={value}
      onChange={onChange}
      inputStyle={inputStyle}
      placeholder={placeholder}
    />
  );
}

export function TextInputWithVoice({
  lang,
  value,
  onChange,
  multiline,
  inputStyle,
  ...rest
}: {
  lang: AppLang;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  inputStyle?: CSSProperties;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const handleAppend = useCallback(
    (chunk: string) => {
      onChange(appendTranscript(value, chunk));
    },
    [onChange, value],
  );

  const base: CSSProperties = {
    flex: "1 1 auto",
    minWidth: 0,
    maxWidth: "100%",
    boxSizing: "border-box",
    ...inputStyle,
  };

  if (multiline) {
    return (
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          boxSizing: "border-box",
        }}
      >
        <textarea
          {...rest}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...base,
            width: "100%",
            display: "block",
            paddingRight: 52,
            paddingBottom: 56,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 12,
            bottom: 12,
            zIndex: 2,
            pointerEvents: "auto",
          }}
        >
          <VoiceInputButton
            lang={lang}
            onAppend={handleAppend}
            disabled={rest.disabled}
            showRecordingLabel
          />
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <input
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={base}
      />
      <VoiceInputButton lang={lang} onAppend={handleAppend} disabled={rest.disabled} />
    </div>
  );
}
