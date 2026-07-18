"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { UploadCloud, CheckCircle2, Loader2, X } from "lucide-react";
import useImgbbUpload from "@/hooks/use-imgbb-upload";

function FieldRenderer({ field, value, onChange, styles = {} }) {
  const baseInputStyle = {
    backgroundColor: styles.inputBgColor,
    borderColor: styles.inputBorderColor,
    borderRadius: `${styles.borderRadius / 2}px`,
  };

  if (field.type === "textarea") {
    return (
      <textarea
        className="w-full border p-2"
        style={baseInputStyle}
        rows={4}
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
        required={field.required}
        placeholder={field.placeholder || `Enter ${field.label}...`}
      />
    );
  }

  if (field.type === "select") {
    return (
      <select
        className="w-full border p-2"
        style={baseInputStyle}
        value={value}
        onChange={(event) => onChange(field.key, event.target.value)}
        required={field.required}
      >
        <option value="">Select an option</option>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="grid gap-2">
        {(field.options || []).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-slate-700 font-medium">
            <input
              type="radio"
              name={field.key}
              value={option}
              checked={value === option}
              onChange={(event) => onChange(field.key, event.target.value)}
              required={field.required}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "checkbox") {
    const selectedValues = Array.isArray(value) ? value : [];
    return (
      <div className="grid gap-2">
        {(field.options || []).map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-slate-700 font-medium">
            <input
              type="checkbox"
              name={field.key}
              checked={selectedValues.includes(option)}
              required={field.required && selectedValues.length === 0}
              onChange={(event) => {
                const nextValues = event.target.checked
                  ? [...selectedValues, option]
                  : selectedValues.filter((item) => item !== option);
                onChange(field.key, nextValues);
              }}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "file") {
    const { uploadImage, uploading, error } = useImgbbUpload();
    const fileInputRef = useRef(null);

    const handleFileChange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        onChange(field.key, url);
      } catch (err) {
        // Error is handled by the hook
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    return (
      <div className="flex flex-col items-start gap-2">
        {value ? (
          <div className="relative group overflow-hidden rounded-md border" style={{ borderColor: styles.inputBorderColor }}>
            <img src={value} alt="Uploaded file" className="h-32 w-48 object-cover" />
            <button
              type="button"
              onClick={() => onChange(field.key, "")}
              className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={14} />
            </button>
            <div className="absolute bottom-1 right-1 bg-green-500 text-white rounded-full p-1 shadow">
              <CheckCircle2 size={14} />
            </div>
          </div>
        ) : (
          <label 
            className="flex flex-col items-center justify-center w-full max-w-sm h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors"
            style={{ borderColor: styles.inputBorderColor, backgroundColor: styles.inputBgColor }}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {uploading ? (
                <Loader2 className="h-8 w-8 text-zinc-400 animate-spin mb-2" />
              ) : (
                <UploadCloud className="w-8 h-8 mb-2 text-zinc-500" />
              )}
              <p className="mb-2 text-sm text-zinc-500">
                <span className="font-semibold">{uploading ? "Uploading..." : "Click to upload image"}</span>
              </p>
            </div>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*"
              className="hidden" 
              onChange={handleFileChange}
              disabled={uploading}
              required={field.required}
            />
          </label>
        )}
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        {/* Hidden input for HTML validation if required but not uploaded */}
        {!value && <input type="text" className="hidden" required={field.required} value="" onChange={() => {}} />}
      </div>
    );
  }

  const type = field.type === "phone" ? "tel" : field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "time" ? "time" : "text";
  return (
    <input
      className="w-full border p-2"
      style={baseInputStyle}
      type={type}
      value={value}
      onChange={(event) => onChange(field.key, event.target.value)}
      required={field.required}
      placeholder={field.placeholder || `Enter ${field.label}...`}
    />
  );
}

export default function PublicFormPage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? decodeURIComponent(params.slug) : "";

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const design = campaign?.design || {};
  const brandColor = design?.brandColor || "#18181b";
  const pageBgColor = design?.pageBgColor || "#f4f4f5";
  const cardBgColor = design?.cardBgColor || "#ffffff";
  const titleColor = design?.titleColor || "#18181b";
  const descriptionColor = design?.descriptionColor || "#71717a";
  const inputBgColor = design?.inputBgColor || "#ffffff";
  const inputBorderColor = design?.inputBorderColor || "#e4e4e7";
  const buttonTextColor = design?.buttonTextColor || "#ffffff";
  const borderRadius = typeof design?.borderRadius === "number" ? design.borderRadius : 12;
  const headerImageUrl = design?.headerImageUrl || "";
  const fontFamily = design?.fontFamily || "Inter";
  const buttonText = design?.submitButtonText || "Submit";
  const thankYouText = design?.successMessage || "Thank you! Your response has been submitted.";
  const redirectUrl = campaign?.redirectUrl || "";

  useEffect(() => {
    if (!fontFamily || fontFamily === "Inter") return;
    const link = document.createElement("link");
    link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(
      /\s+/g,
      "+"
    )}:wght@400;500;600;700&display=swap`;
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      try {
        document.head.removeChild(link);
      } catch (e) {}
    };
  }, [fontFamily]);

  useEffect(() => {
    if (!slug) return;

    fetch(`/api/forms/${slug}`)
      .then((response) => response.json().then((json) => ({ response, json })))
      .then(({ response, json }) => {
        if (!response.ok) {
          setError(json?.error || "Form not found");
          setLoading(false);
          return;
        }
        const formData = json?.data || null;
        setCampaign(formData);

        const initialAnswers = {};
        (formData?.fields || []).forEach((field) => {
          initialAnswers[field.key] = field.type === "checkbox" ? [] : "";
        });
        setAnswers(initialAnswers);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load form");
        setLoading(false);
      });
  }, [slug]);

  function updateAnswer(key, value) {
    setAnswers((state) => ({
      ...state,
      [key]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");

    if (!slug) {
      setError("Form not found");
      setSubmitting(false);
      return;
    }

    const missingField = (campaign?.fields || []).find((field) => {
      if (!field.required) return false;
      const answer = answers[field.key];
      if (Array.isArray(answer)) return answer.length === 0;
      return String(answer || "").trim() === "";
    });

    if (missingField) {
      setError(`${missingField.label} is required`);
      setSubmitting(false);
      return;
    }

    const response = await fetch(`/api/forms/${slug}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    const json = await response.json();

    if (!response.ok) {
      setError(json?.error || "Failed to submit form");
      setSubmitting(false);
      return;
    }

    const resetAnswers = {};
    (campaign?.fields || []).forEach((field) => {
      resetAnswers[field.key] = field.type === "checkbox" ? [] : "";
    });
    setAnswers(resetAnswers);

    setMessage(thankYouText);
    setSubmitting(false);
  }

  return (
    <main className="min-h-screen p-4" style={{ backgroundColor: pageBgColor, fontFamily }}>
      <div
        className="mx-auto w-full max-w-2xl overflow-hidden border shadow-xl transition-all duration-300"
        style={{
          backgroundColor: cardBgColor,
          borderRadius: `${borderRadius}px`,
        }}
      >
        {headerImageUrl && (
          <img src={headerImageUrl} alt="Banner" className="h-48 w-full object-cover" />
        )}

        <div className="p-8">
          {loading ? (
            <p className="text-sm text-zinc-500">Loading form...</p>
          ) : error ? (
            <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-6">
              <div>
                <h1 className="text-3xl font-bold" style={{ color: titleColor }}>
                  {campaign?.name}
                </h1>
                {campaign?.description ? (
                  <div
                    className="mt-2 text-base"
                    style={{ color: descriptionColor }}
                    dangerouslySetInnerHTML={{ __html: campaign.description }}
                  />
                ) : null}
              </div>

              {(campaign?.fields || []).map((field) => (
                <div key={field.key} className="grid gap-2">
                  <label className="text-sm font-semibold text-zinc-700">
                    {field.label}
                    {field.required ? " *" : ""}
                  </label>
                  <FieldRenderer
                    field={field}
                    value={answers[field.key]}
                    onChange={updateAnswer}
                    styles={{ inputBgColor, inputBorderColor, borderRadius }}
                  />
                </div>
              ))}

              {message && (
                <p className="rounded-lg bg-emerald-50 p-3 text-sm font-medium text-emerald-700">
                  {message}
                </p>
              )}
              {message && redirectUrl ? (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-700">
                    Submit সফল হয়েছে। নিচের লিংকে click করলে continue করতে পারবেন।
                  </p>
                  <a
                    href={redirectUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center rounded-lg px-4 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: brandColor }}
                  >
                    Open Continue Link
                  </a>
                  <p className="mt-2 break-all text-xs text-zinc-500">{redirectUrl}</p>
                </div>
              ) : null}
              {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full py-3 text-base font-bold shadow-sm transition-all hover:opacity-90 disabled:opacity-60"
                style={{
                  backgroundColor: brandColor,
                  color: buttonTextColor,
                  borderRadius: `${borderRadius / 2}px`,
                }}
              >
                {submitting ? "Submitting..." : buttonText}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
