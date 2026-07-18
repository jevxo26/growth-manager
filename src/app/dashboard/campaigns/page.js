"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getCustomerHeaders } from "@/components/customer-api";
import RichTextEditor from "@/components/rich-text-editor";
import useImgbbUpload from "@/hooks/use-imgbb-upload";
import DataTable from "@/components/dashboard/DataTable";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowUp, ArrowDown, Copy, Trash2, GripHorizontal } from "lucide-react";

const FIELD_TYPES = ["text", "phone", "email", "textarea", "select", "radio", "checkbox", "file", "date", "time"];
const FONT_OPTIONS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Montserrat",
  "Poppins",
  "Playfair Display",
  "Lato",
];

function makeEmptyField(index = 0) {
  return {
    id: `field-${Date.now()}-${index}`,
    label: "",
    key: "",
    type: "text",
    required: false,
    optionsText: "",
    placeholder: "",
  };
}

export default function DashboardCampaignsPage() {
  const [activeTab, setActiveTab] = useState("create");
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("#4f46e5");
  const [pageBgColor, setPageBgColor] = useState("#f8fafc");
  const [cardBgColor, setCardBgColor] = useState("#ffffff");
  const [titleColor, setTitleColor] = useState("#0f172a");
  const [descriptionColor, setDescriptionColor] = useState("#64748b");
  const [inputBgColor, setInputBgColor] = useState("#ffffff");
  const [inputBorderColor, setInputBorderColor] = useState("#e2e8f0");
  const [buttonTextColor, setButtonTextColor] = useState("#ffffff");
  const [borderRadius, setBorderRadius] = useState(16);
  const [headerImageUrl, setHeaderImageUrl] = useState("");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [submitButtonText, setSubmitButtonText] = useState("Submit");
  const [successMessage, setSuccessMessage] = useState(
    "Thank you! Your response has been submitted."
  );
  const [fields, setFields] = useState([makeEmptyField(1)]);
  const [activeFieldId, setActiveFieldId] = useState(fields[0].id);
  const [origin, setOrigin] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const {
    uploadImage,
    uploading: uploadingHeaderImage,
    error: headerImageUploadError,
    clearError: clearHeaderImageUploadError,
  } = useImgbbUpload();

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  function buildShareUrl(pathname) {
    const normalizedPath = String(pathname || "").startsWith("/") ? pathname : `/${pathname}`;
    const envBase = String(process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
    const runtimeBase = String(origin || "").trim().replace(/\/+$/, "");
    const base = envBase || runtimeBase;
    return base ? `${base}${normalizedPath}` : normalizedPath;
  }

  async function handleHeaderImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    clearHeaderImageUploadError();

    try {
      const uploadedUrl = await uploadImage(file);
      setHeaderImageUrl(uploadedUrl);
    } catch {}
  }

  async function loadCampaigns() {
    setLoading(true);
    try {
      const response = await fetch("/api/campaigns", { headers: getCustomerHeaders() });
      const json = await response.json();

      if (!response.ok) {
        setError(json?.error || "Failed to load campaigns");
        setLoading(false);
        return;
      }

      setCampaigns(Array.isArray(json?.data) ? json.data : []);
    } catch {
      setError("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCampaigns();
  }, []);

  const previewFields = useMemo(
    () => fields.filter((field) => String(field.label || "").trim()),
    [fields]
  );

  function addField() {
    const newField = makeEmptyField(fields.length + 1);
    setFields((state) => [...state, newField]);
    setActiveFieldId(newField.id);
  }

  function updateField(id, patch) {
    setFields((state) => state.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }

  function removeField(id) {
    setFields((state) => (state.length <= 1 ? state : state.filter((field) => field.id !== id)));
  }

  function duplicateField(index) {
    setFields((state) => {
      const newFields = [...state];
      const source = newFields[index];
      const duplicated = { ...source, id: `field-${Date.now()}` };
      newFields.splice(index + 1, 0, duplicated);
      setActiveFieldId(duplicated.id);
      return newFields;
    });
  }

  function moveField(index, direction) {
    setFields((state) => {
      const newFields = [...state];
      if (direction === "up" && index > 0) {
        [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
      } else if (direction === "down" && index < newFields.length - 1) {
        [newFields[index], newFields[index + 1]] = [newFields[index + 1], newFields[index]];
      }
      return newFields;
    });
  }

  async function handleCreateCampaign(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError("");

    const usedKeys = new Set();
    const normalizedFields = fields
      .filter((field) => String(field.label || "").trim())
      .map((field, idx) => {
        let baseKey = String(field.key || field.label || `field_${idx}`)
          .trim()
          .replace(/[^a-zA-Z0-9_]/g, "_")
          .replace(/_+/g, "_")
          .toLowerCase();
          
        if (!baseKey || baseKey === "_") baseKey = `field_${idx}`;
        
        let finalKey = baseKey;
        let counter = 1;
        while (usedKeys.has(finalKey)) {
          finalKey = `${baseKey}_${counter}`;
          counter++;
        }
        usedKeys.add(finalKey);

        return {
          key: finalKey,
          label: String(field.label || "").trim(),
          placeholder: String(field.placeholder || "").trim(),
          type: field.type,
          required: Boolean(field.required),
          options: (() => {
            if (!["select", "radio", "checkbox"].includes(field.type)) return [];
            const opts = String(field.optionsText || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
            return opts.length > 0 ? opts : ["Option 1"];
          })(),
        };
      });

    if (!normalizedFields.length) {
      setError("At least one field is required");
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: getCustomerHeaders(),
      body: JSON.stringify({
        name,
        description,
        status: "active",
        redirectUrl: String(redirectUrl || "").trim(),
        fields: normalizedFields,
        design: {
          brandColor,
          pageBgColor,
          cardBgColor,
          titleColor,
          descriptionColor,
          inputBgColor,
          inputBorderColor,
          buttonTextColor,
          borderRadius: parseInt(borderRadius, 10) || 0,
          headerImageUrl,
          fontFamily,
          submitButtonText,
          successMessage,
        },
      }),
    });
    const json = await response.json();

    if (!response.ok) {
      setError(json?.error || "Failed to create campaign");
      setSubmitting(false);
      return;
    }

    setMessage("Campaign form created successfully.");
    setName("");
    setDescription("");
    setBrandColor("#4f46e5");
    setPageBgColor("#f8fafc");
    setCardBgColor("#ffffff");
    setSubmitButtonText("Submit");
    setSuccessMessage("Thank you! Your response has been submitted.");
    setFields([makeEmptyField(1)]);
    setRedirectUrl("");
    setSubmitting(false);
    await loadCampaigns();
  }

  async function handleDeleteCampaign(campaignId) {
    const confirmed = window.confirm("Are you sure you want to delete this campaign?");
    if (!confirmed) return;

    setDeletingId(campaignId);
    setMessage("");
    setError("");

    const response = await fetch(`/api/campaigns/${campaignId}`, {
      method: "DELETE",
      headers: getCustomerHeaders(),
    });
    const json = await response.json();

    if (!response.ok) {
      setError(json?.error || "Failed to delete campaign");
      setDeletingId("");
      return;
    }

    setCampaigns((state) => state.filter((campaign) => campaign._id !== campaignId));
    setMessage("Campaign deleted successfully.");
    setDeletingId("");
  }

  const columns = [
    { 
      header: "Name", 
      accessor: "name",
      render: (row) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900">{row.name}</span>
          <span className="text-xs text-slate-500">{Array.isArray(row.fields) ? row.fields.length : 0} fields</span>
        </div>
      )
    },
    { 
      header: "Status", 
      accessor: "status",
      render: (row) => (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
          row.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-600"
        }`}>
          {row.status}
        </span>
      )
    },
    { 
      header: "Share URL", 
      accessor: "slug",
      render: (row) => {
        const shareUrl = buildShareUrl(`/f/${row.publicToken || row.slug}`);
        return (
          <a href={shareUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate max-w-[200px] block">
            {shareUrl}
          </a>
        );
      }
    },
    { 
      header: "Actions", 
      accessor: "_id",
      render: (row) => (
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/leads?campaignId=${row._id}`}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200"
          >
            Leads
          </Link>
          <button
            type="button"
            className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50"
            disabled={deletingId === row._id}
            onClick={() => handleDeleteCampaign(row._id)}
          >
            {deletingId === row._id ? "..." : "Delete"}
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Campaigns</h1>
          <p className="mt-2 text-slate-500">Manage your dynamic forms and feedback campaigns.</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border bg-white p-1.5 shadow-sm">
          <button
            onClick={() => setActiveTab("create")}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              activeTab === "create" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Create Form
          </button>
          <button
            onClick={() => setActiveTab("campaign")}
            className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${
              activeTab === "campaign" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Form List
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {message && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl bg-emerald-50 p-4 text-sm font-medium text-emerald-700 ring-1 ring-emerald-200"
          >
            {message}
          </motion.div>
        )}
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl bg-rose-50 p-4 text-sm font-medium text-rose-700 ring-1 ring-rose-200"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {activeTab === "create" ? (
        <div className="grid gap-8 xl:grid-cols-[1fr_400px]">
          <motion.form 
            initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
            onSubmit={handleCreateCampaign} 
            className="space-y-8 rounded-3xl border border-slate-200 bg-white p-8"
          >
            <div>
              <h2 className="text-lg font-bold text-slate-900">Campaign Details</h2>
              <div className="mt-4 grid gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Form Name</label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                    placeholder="e.g. Customer Feedback Q2"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
                  <RichTextEditor value={description} onChange={setDescription} minHeight={180} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Redirect Link (Optional)</label>
                  <input
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition-all focus:border-indigo-600 focus:ring-4 focus:ring-indigo-600/10"
                    placeholder="https://yourwebsite.com/thanks"
                    value={redirectUrl}
                    onChange={(e) => setRedirectUrl(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-50 p-6">
              <h2 className="text-lg font-bold text-slate-900">UI Customization</h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Header Image</label>
                  <div className="flex items-center gap-3">
                    <input
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none transition-all focus:border-indigo-600"
                      placeholder="Image URL"
                      value={headerImageUrl}
                      onChange={(e) => setHeaderImageUrl(e.target.value)}
                    />
                    <label className="cursor-pointer rounded-xl bg-white border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                      {uploadingHeaderImage ? "..." : "Upload"}
                      <input type="file" accept="image/*" className="hidden" onChange={handleHeaderImageUpload} disabled={uploadingHeaderImage} />
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Font</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-600"
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                  >
                    {FONT_OPTIONS.map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Corners: {borderRadius}px</label>
                  <input
                    type="range" min="0" max="40" className="h-1.5 w-full accent-indigo-600"
                    value={borderRadius} onChange={(e) => setBorderRadius(parseInt(e.target.value, 10))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Button Text</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600"
                    value={submitButtonText} onChange={(e) => setSubmitButtonText(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Primary Color</label>
                  <div className="flex items-center gap-2">
                    <input type="color" className="h-10 w-10 overflow-hidden rounded-lg border-0 p-0" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} />
                    <span className="text-xs font-mono text-slate-500 uppercase">{brandColor}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">Form Fields</h2>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1 space-y-4">
                  {fields.map((field, idx) => {
                    const isActive = activeFieldId === field.id;

                    return (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        key={field.id} 
                        onClick={() => !isActive && setActiveFieldId(field.id)}
                        className={`group relative rounded-xl border bg-white shadow-sm transition-all ${
                          isActive ? 'border-l-4 border-l-indigo-600 border-t-slate-200 border-r-slate-200 border-b-slate-200 shadow-md' : 'border-slate-200 cursor-pointer hover:border-slate-300'
                        }`}
                      >
                        {isActive ? (
                          <>
                            {/* Drag Handle (Visual only for now) */}
                            <div className="flex w-full justify-center rounded-t-xl py-1 cursor-move opacity-0 transition-opacity group-hover:opacity-100 absolute -top-4 left-0">
                              <GripHorizontal className="h-4 w-4 text-slate-300" />
                            </div>

                            <div className="p-6">
                              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                <div className="sm:col-span-2 lg:col-span-3">
                                  <input
                                    className="w-full border-b-2 border-slate-200 bg-slate-50 px-3 py-3 text-base font-medium text-slate-900 outline-none transition-all focus:border-indigo-600 focus:bg-slate-100 rounded-t-md"
                                    placeholder="Question Title"
                                    value={field.label}
                                    onChange={(e) => updateField(field.id, { label: e.target.value })}
                                    required
                                    autoFocus
                                  />
                                </div>
                                <div className="sm:col-span-1 lg:col-span-1">
                                  <select
                                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-600"
                                    value={field.type}
                                    onChange={(e) => updateField(field.id, { type: e.target.value })}
                                  >
                                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                  </select>
                                </div>
                              </div>
                              
                              {["text", "phone", "email", "textarea"].includes(field.type) && (
                                <div className="mt-4 pl-1">
                                  <input
                                    className="w-full border-b border-slate-200 bg-transparent px-2 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 transition-all"
                                    placeholder="Placeholder text (optional)"
                                    value={field.placeholder || ""}
                                    onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                                  />
                                </div>
                              )}
                              
                              {["select", "radio", "checkbox"].includes(field.type) && (
                                <div className="mt-4 pl-1">
                                  <input
                                    className="w-full border-b border-slate-200 bg-transparent px-2 py-2 text-sm text-slate-900 outline-none focus:border-indigo-600 transition-all"
                                    placeholder="Options (comma separated, e.g. Option 1, Option 2)"
                                    value={field.optionsText}
                                    onChange={(e) => updateField(field.id, { optionsText: e.target.value })}
                                  />
                                </div>
                              )}

                              <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => moveField(idx, "up")} disabled={idx === 0} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-30">
                                    <ArrowUp className="h-4 w-4" />
                                  </button>
                                  <button type="button" onClick={() => moveField(idx, "down")} disabled={idx === fields.length - 1} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-30">
                                    <ArrowDown className="h-4 w-4" />
                                  </button>
                                </div>

                                <div className="flex items-center gap-4">
                                  <div className="flex items-center gap-3 border-r border-slate-200 pr-5">
                                    <span className="text-sm font-medium text-slate-600">Required</span>
                                    <label className="flex cursor-pointer items-center">
                                      <div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${field.required ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                        <input type="checkbox" className="sr-only" checked={field.required} onChange={(e) => updateField(field.id, { required: e.target.checked })} />
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${field.required ? 'translate-x-4.5' : 'translate-x-0.5'} shadow-sm`} />
                                      </div>
                                    </label>
                                  </div>
                                  
                                  <button type="button" onClick={() => duplicateField(idx)} className="text-slate-400 hover:text-slate-700" title="Duplicate">
                                    <Copy className="h-5 w-5" />
                                  </button>
                                  
                                  {fields.length > 1 && (
                                    <button type="button" onClick={() => removeField(field.id)} className="text-slate-400 hover:text-rose-600" title="Delete">
                                      <Trash2 className="h-5 w-5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="p-6">
                            <div className="flex items-start justify-between">
                              <h3 className="text-base font-medium text-slate-800">
                                {field.label || "Untitled Question"} {field.required && <span className="text-red-500">*</span>}
                              </h3>
                            </div>
                            
                            <div className="mt-4 opacity-70 pointer-events-none">
                              {field.type === "textarea" ? (
                                <div className="border-b border-dotted border-slate-400 w-3/4 pb-1">
                                  <span className="text-sm text-slate-500">Long answer text</span>
                                </div>
                              ) : field.type === "radio" || field.type === "checkbox" ? (
                                <div className="space-y-2">
                                  {field.optionsText ? field.optionsText.split(",").map((opt, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                      <div className={`h-4 w-4 border border-slate-400 ${field.type === 'radio' ? 'rounded-full' : 'rounded-sm'}`} />
                                      <span className="text-sm text-slate-800">{opt.trim()}</span>
                                    </div>
                                  )) : (
                                    <div className="flex items-center gap-2">
                                      <div className={`h-4 w-4 border border-slate-400 ${field.type === 'radio' ? 'rounded-full' : 'rounded-sm'}`} />
                                      <span className="text-sm text-slate-800">Option 1</span>
                                    </div>
                                  )}
                                </div>
                              ) : field.type === "file" ? (
                                <div className="flex items-center gap-2 text-sm text-slate-500 border border-slate-300 rounded px-3 py-2 w-fit">
                                  File upload
                                </div>
                              ) : field.type === "select" ? (
                                <div className="border border-slate-300 rounded px-3 py-2 text-sm text-slate-500 w-1/3">
                                  Dropdown
                                </div>
                              ) : field.type === "date" ? (
                                <div className="border-b border-dotted border-slate-400 w-1/3 pb-1">
                                  <span className="text-sm text-slate-500">Month, day, year</span>
                                </div>
                              ) : field.type === "time" ? (
                                <div className="border-b border-dotted border-slate-400 w-1/4 pb-1">
                                  <span className="text-sm text-slate-500">Time</span>
                                </div>
                              ) : (
                                <div className="border-b border-dotted border-slate-400 w-1/2 pb-1">
                                  <span className="text-sm text-slate-500">Short answer text</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                  
                  <div className="flex justify-center pt-4">
                    <button type="button" onClick={addField} className="flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-indigo-600 shadow-md border border-slate-100 hover:shadow-lg transition-all">
                      <span className="text-xl leading-none">+</span> Add New Question
                    </button>
                  </div>
                </div>

                {/* Floating Toolbar (Desktop) */}
                <div className="hidden sm:flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm h-fit sticky top-32">
                  <button type="button" onClick={addField} className="rounded-full p-3 text-slate-600 hover:bg-slate-100 hover:text-indigo-600 transition-colors" title="Add Question">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-2xl bg-indigo-600 py-4 text-sm font-bold text-white shadow-xl shadow-indigo-600/20 transition-all hover:bg-indigo-700 hover:translate-y-[-2px] disabled:opacity-50"
              >
                {submitting ? "Creating Campaign..." : "Create Campaign Form"}
              </button>
            </div>
          </motion.form>

          <aside className="sticky top-24 hidden h-fit space-y-6 lg:block">
            <div className="rounded-3xl border border-slate-200 bg-slate-900 p-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Live Preview
            </div>
            <div 
              className="overflow-hidden shadow-2xl transition-all duration-500" 
              style={{ backgroundColor: pageBgColor, fontFamily: fontFamily, borderRadius: "24px" }}
            >
              <div 
                className="mx-auto w-full shadow-md" 
                style={{ backgroundColor: cardBgColor, borderRadius: `${borderRadius}px`, borderTop: `8px solid ${brandColor}` }}
              >
                {headerImageUrl && (
                  <img src={headerImageUrl} alt="Preview" className="h-24 w-full object-cover" />
                )}
                <div className="p-6">
                  <h3 className="text-xl font-bold" style={{ color: titleColor }}>{name || "Campaign Name"}</h3>
                  <div 
                    className="mt-2 text-xs opacity-80" 
                    style={{ color: descriptionColor }} 
                    dangerouslySetInnerHTML={{ __html: description || "Form description goes here..." }} 
                  />

                  <div className="mt-6 space-y-4">
                    {previewFields.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-[10px] text-slate-400">Add fields to preview</div>
                    ) : (
                      previewFields.map((f) => (
                        <div key={f.id} className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{f.label} {f.required && "*"}</label>
                          {f.type === "file" ? (
                            <div 
                              className="flex flex-col items-center justify-center w-full h-16 border-2 border-dashed rounded-lg"
                              style={{ borderColor: inputBorderColor, backgroundColor: inputBgColor }}
                            >
                              <span className="text-[10px] text-slate-400 font-semibold">Click to upload image</span>
                            </div>
                          ) : (f.type === "checkbox" || f.type === "radio") ? (
                            <div className="flex items-center gap-2 mt-1">
                              <input type={f.type} disabled className="h-3 w-3" />
                              <span className="text-[10px] text-slate-500">Option 1</span>
                            </div>
                          ) : (
                            <div 
                              className="w-full border p-2.5 text-xs text-slate-400" 
                              style={{ backgroundColor: inputBgColor, borderColor: inputBorderColor, borderRadius: `${borderRadius / 2}px` }}
                            >
                              {f.type === "select" ? "Select an option..." : f.type === "date" ? "mm/dd/yyyy" : f.type === "time" ? "--:-- --" : f.placeholder ? f.placeholder : `Enter ${f.label}...`}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    <div 
                      className="mt-2 py-3 text-center text-xs font-bold" 
                      style={{ backgroundColor: brandColor, color: buttonTextColor, borderRadius: `${borderRadius / 2}px` }}
                    >
                      {submitButtonText}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <DataTable 
            title="Active Campaigns" 
            subtitle="Manage and share your live campaign forms."
            columns={columns} 
            data={campaigns} 
            emptyMessage="No campaigns found. Create your first form!"
          />
        </motion.div>
      )}
    </div>
  );
}
