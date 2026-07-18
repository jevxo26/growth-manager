"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor } from "@tinymce/tinymce-react";

function htmlToText(html) {
  if (typeof window === "undefined") return String(html || "");
  const root = document.createElement("div");
  root.innerHTML = String(html || "");

  function toFormattedText(node) {
    if (!node) return "";
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
    if (node.nodeType !== Node.ELEMENT_NODE) return "";

    const tag = node.tagName.toLowerCase();
    const childText = Array.from(node.childNodes).map(toFormattedText).join("");

    if (tag === "strong" || tag === "b") {
      const match = childText.match(/^(\s*)(.*?)(\s*)$/s);
      if (match && match[2]) {
        return `${match[1]}*${match[2]}*${match[3]}`;
      }
      return `*${childText}*`;
    }
    if (tag === "em" || tag === "i") {
      const match = childText.match(/^(\s*)(.*?)(\s*)$/s);
      if (match && match[2]) {
        return `${match[1]}_${match[2]}_${match[3]}`;
      }
      return `_${childText}_`;
    }
    if (tag === "s" || tag === "strike" || tag === "del") {
      const match = childText.match(/^(\s*)(.*?)(\s*)$/s);
      if (match && match[2]) {
        return `${match[1]}~${match[2]}~${match[3]}`;
      }
      return `~${childText}~`;
    }
    if (tag === "u") return childText; // WhatsApp has no native underline support, keep as plain text
    if (tag === "br") return "\n";
    if (tag === "li") return `- ${childText}\n`;
    if (tag === "p" || tag === "div") return `${childText}\n`;
    if (tag === "td" || tag === "th") return `${childText} | `;
    if (tag === "tr") return `${childText}\n`;
    if (tag === "table") return `\n${childText}\n`;
    return childText;
  }

  const text = Array.from(root.childNodes).map(toFormattedText).join("");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function textToHtml(text) {
  let html = String(text || "")
    .split("\n")
    .map((line) => `<p>${line || "&nbsp;"}</p>`)
    .join("");

  return html
    .replace(/\*(.+?)\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/~(.+?)~/g, "<del>$1</del>");
}

export default function RichTextEditor({
  value,
  onChange,
  disabled = false,
  outputMode = "html",
  minHeight = 240,
}) {
  const editorRef = useRef(null);
  const lastSynced = useRef(value);
  const prevMode = useRef(outputMode);
  const valueRef = useRef(value);
  const [editorReady, setEditorReady] = useState(false);

  valueRef.current = value;

  useEffect(() => {
    return () => {
      setEditorReady(false);
      editorRef.current = null;
    };
  }, []);

  const valueToEditorHtml = useCallback(
    (v) => (outputMode === "text" ? textToHtml(v) : String(v || "")),
    [outputMode]
  );

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;

    const html = valueToEditorHtml(value);
    const modeChanged = prevMode.current !== outputMode;
    prevMode.current = outputMode;

    if (modeChanged) {
      lastSynced.current = value;
      ed.setContent(html || "<p></p>");
      return;
    }

    if (value === lastSynced.current) return;

    lastSynced.current = value;
    if (ed.getContent() !== html) {
      ed.setContent(html || "<p></p>");
    }
  }, [value, outputMode, valueToEditorHtml]);

  const tinyApiKey =
    process.env.NEXT_PUBLIC_TINYMCE_API_KEY ||
    "mrjzg34xdadqgcqxfqjm0c1ymp23fumthj7ds61a4vlmvlrn";
  const tinyScriptSrc = useMemo(
    () => `https://cdn.tiny.cloud/1/${tinyApiKey}/tinymce/7/tinymce.min.js`,
    [tinyApiKey]
  );

  const init = useMemo(
    () => ({
      menubar: false,
      branding: false,
      statusbar: false,
      height: minHeight,
      plugins: "lists link table code autoresize",
      toolbar:
        "undo redo | bold italic underline | bullist numlist | alignleft aligncenter alignright | link table | removeformat code",
      content_style:
        "body { font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; padding: 8px; }",
    }),
    [minHeight]
  );

  const handleEditorChange = useCallback(
    (content) => {
      const out = outputMode === "text" ? htmlToText(content) : content;
      lastSynced.current = out;
      onChange(out);
    },
    [outputMode, onChange]
  );

  const handleInit = useCallback(
    (_evt, editor) => {
      editorRef.current = editor;
      const v = valueRef.current;
      const html = valueToEditorHtml(v);
      editor.setContent(html || "<p></p>");
      lastSynced.current = v;
      prevMode.current = outputMode;
      setEditorReady(true);
    },
    [outputMode, valueToEditorHtml]
  );

  return (
    <Editor
      tinymceScriptSrc={tinyScriptSrc}
      initialValue={editorReady ? undefined : valueToEditorHtml(value)}
      disabled={disabled}
      onInit={handleInit}
      init={init}
      onEditorChange={handleEditorChange}
    />
  );
}
