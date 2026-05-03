"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getCustomerHeaders } from "@/components/customer-api";
import { motion, AnimatePresence } from "framer-motion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LeadsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCampaignId = searchParams.get("campaignId") || "";

  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState(initialCampaignId);
  const [leads, setLeads] = useState([]);
  const [count, setCount] = useState(0);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [error, setError] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [emailSending, setEmailSending] = useState(false);
  const [wpSending, setWpSending] = useState(false);
  const [deletingLeadId, setDeletingLeadId] = useState("");
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [deletingCampaignId, setDeletingCampaignId] = useState("");
  const [editingLeadId, setEditingLeadId] = useState("");
  const [editValues, setEditValues] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const selectedCampaign = campaigns.find((item) => String(item._id) === String(selectedCampaignId)) || null;
  const selectedLeadSet = useMemo(() => new Set(selectedLeadIds.map(String)), [selectedLeadIds]);
  const allLeadIds = useMemo(() => leads.map((lead) => String(lead._id)), [leads]);
  const allSelected = allLeadIds.length > 0 && allLeadIds.every((id) => selectedLeadSet.has(id));

  useEffect(() => {
    fetch("/api/campaigns", { headers: getCustomerHeaders() })
      .then((r) => r.json())
      .then((json) => {
        const items = Array.isArray(json?.data) ? json.data : [];
        setCampaigns(items);
        if (items.length) {
          setSelectedCampaignId((prev) => prev || String(items[0]._id));
        }
      })
      .catch(() => setError("Failed to load campaigns"))
      .finally(() => setLoadingCampaigns(false));
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) return;
    loadLeads(selectedCampaignId);
  }, [selectedCampaignId]);

  function loadLeads(campaignId, options = {}) {
    if (!campaignId) return;
    const { preserveSelection = false } = options;
    setLoadingLeads(true);
    setError("");
    if (!preserveSelection) setSelectedLeadIds([]);

    fetch(`/api/campaigns/${campaignId}/leads`, { headers: getCustomerHeaders() })
      .then((r) => r.json())
      .then((json) => {
        setLeads(Array.isArray(json?.data?.leads) ? json.data.leads : []);
        setCount(Number(json?.data?.count || 0));
      })
      .catch(() => setError("Failed to load leads"))
      .finally(() => setLoadingLeads(false));
  }

  function toggleLeadSelection(leadId) {
    const id = String(leadId);
    setSelectedLeadIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleSelectAllLeads() {
    if (allSelected) setSelectedLeadIds([]);
    else setSelectedLeadIds(allLeadIds);
  }

  function normalizeKey(value) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
  }

  function findAnswerByField(answers, field) {
    if (!answers || !field) return "";
    const baseKey = normalizeKey(field.label) || String(field.key || "");
    if (!baseKey) return "";
    if (Object.prototype.hasOwnProperty.call(answers, baseKey)) return answers[baseKey];
    const keys = Object.keys(answers);
    const matchedKey = keys.find((k) => k === baseKey || k.startsWith(baseKey));
    return matchedKey ? answers[matchedKey] : "";
  }

  function sanitizePhoneDigits(value) {
    return String(value || "").replace(/[^\d]/g, "");
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function buildPhoneRecipients(leadSource) {
    const phoneField = (selectedCampaign?.fields || []).find((f) => f.type === "phone");
    const nameField =
      (selectedCampaign?.fields || []).find(
        (f) => f.type === "text" && /name/i.test(f.label || f.key)
      ) || (selectedCampaign?.fields || []).find((f) => f.type === "text");
    if (!phoneField || !nameField) return null;

    return leadSource
      .map((lead) => ({
        name: String(findAnswerByField(lead.answers, nameField) || "").trim(),
        phone: sanitizePhoneDigits(findAnswerByField(lead.answers, phoneField)),
      }))
      .filter((item) => item.phone);
  }

  function handleExport(type) {
    setError("");
    if (!selectedCampaignId) return setError("Select a campaign first.");

    const leadSource = selectedLeadIds.length ? leads.filter((l) => selectedLeadSet.has(String(l._id))) : leads;
    
    if (type === "phone") {
      const recipients = buildPhoneRecipients(leadSource);
      if (!recipients) return setError("Campaign lacks name/phone fields.");

      const data = recipients.map((item) => ({ Name: item.name, Phone: item.phone }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      XLSX.writeFile(wb, "wp-recipients.xlsx");
    } else {
      const emailField = (selectedCampaign?.fields || []).find((f) => f.type === "email");
      const nameField = (selectedCampaign?.fields || []).find((f) => f.type === "text" && /name/i.test(f.label || f.key)) || (selectedCampaign?.fields || []).find((f) => f.type === "text");
      if (!emailField || !nameField) return setError("Campaign lacks name/email fields.");

      const data = leadSource.map(l => ({ Name: findAnswerByField(l.answers, nameField), Email: normalizeEmail(findAnswerByField(l.answers, emailField)) })).filter(d => EMAIL_RE.test(d.Email));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leads");
      XLSX.writeFile(wb, "email-recipients.xlsx");
    }
  }

  function getActiveLeadSource() {
    return selectedLeadIds.length ? leads.filter((lead) => selectedLeadSet.has(String(lead._id))) : leads;
  }

  function getTabularRows() {
    const leadSource = getActiveLeadSource();
    return leadSource.map((lead) => {
      const row = {
        "Submitted At": lead.submittedAt ? new Date(lead.submittedAt).toLocaleString() : "-",
      };
      columns.forEach((column) => {
        const value = lead.answers?.[column];
        row[column] = Array.isArray(value) ? value.join(", ") : value ?? "-";
      });
      return row;
    });
  }

  function exportExcel() {
    setError("");
    if (!selectedCampaignId) return setError("Select a campaign first.");
    const rows = getTabularRows();
    if (!rows.length) return setError("No leads to export.");

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    XLSX.writeFile(wb, `${selectedCampaign?.name || "campaign"}-leads.xlsx`);
  }

  async function exportPdf() {
    setError("");
    if (!selectedCampaignId) return setError("Select a campaign first.");
    const rows = getTabularRows();
    if (!rows.length) return setError("No leads to export.");

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    let page = pdfDoc.addPage([842, 595]);
    const { width, height } = page.getSize();
    const margin = 24;
    const lineHeight = 14;
    const maxLineWidth = width - margin * 2;
    const fontSize = 10;
    let y = height - margin;

    function writeLine(text) {
      if (y < margin + lineHeight) {
        page = pdfDoc.addPage([842, 595]);
        y = height - margin;
      }
      page.drawText(String(text).slice(0, 300), {
        x: margin,
        y,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: maxLineWidth,
      });
      y -= lineHeight;
    }

    writeLine(`Campaign: ${selectedCampaign?.name || "-"}`);
    writeLine(`Total exported: ${rows.length}`);
    writeLine(`Generated at: ${new Date().toLocaleString()}`);
    y -= 8;

    rows.forEach((row, index) => {
      writeLine(`${index + 1}.`);
      Object.entries(row).forEach(([key, value]) => {
        writeLine(`  ${key}: ${String(value ?? "-")}`);
      });
      y -= 4;
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedCampaign?.name || "campaign"}-leads.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleSendToPromotions() {
    if (!selectedLeadIds.length) return setError("Select leads first.");
    setEmailSending(true);
    try {
      const res = await fetch("/api/email-promotions/draft", {
        method: "POST",
        headers: getCustomerHeaders(),
        body: JSON.stringify({ campaignId: selectedCampaignId, leadIds: selectedLeadIds }),
      });
      const json = await res.json();
      if (json.data?.draftId) router.push(`/dashboard/email-promotions?draftId=${json.data.draftId}`);
      else throw new Error(json.error || "Failed to create draft");
    } catch (err) { setError(err.message); } finally { setEmailSending(false); }
  }

  async function handleSendToWpSystem() {
    if (!selectedLeadIds.length) return setError("Select leads first.");
    setWpSending(true);
    setError("");
    try {
      const leadSource = leads.filter((lead) => selectedLeadSet.has(String(lead._id)));
      const recipients = buildPhoneRecipients(leadSource);
      if (!recipients) throw new Error("Campaign lacks name/phone fields.");
      if (!recipients.length) throw new Error("No valid phone numbers found in selected leads.");

      const res = await fetch("/api/wp-promotions/draft/from-recipients", {
        method: "POST",
        headers: getCustomerHeaders(),
        body: JSON.stringify({ recipients }),
      });
      const json = await res.json();
      if (json.data?.draftId) router.push(`/dashboard/wp-promotions?draftId=${json.data.draftId}`);
      else throw new Error(json.error || "Failed to create WP draft");
    } catch (err) {
      setError(err.message || "Failed to send recipients to WP system");
    } finally {
      setWpSending(false);
    }
  }

  async function handleDeleteLeads(leadIds) {
    const normalizedLeadIds = Array.isArray(leadIds) ? leadIds.map(String).filter(Boolean) : [];
    if (!selectedCampaignId || !normalizedLeadIds.length) return;

    const confirmText =
      normalizedLeadIds.length === 1
        ? "Delete this lead?"
        : `Delete ${normalizedLeadIds.length} selected leads?`;
    const confirmed = window.confirm(confirmText);
    if (!confirmed) return;

    setError("");
    if (normalizedLeadIds.length === 1) setDeletingLeadId(normalizedLeadIds[0]);
    else setDeletingSelected(true);

    try {
      const response = await fetch(`/api/campaigns/${selectedCampaignId}/leads`, {
        method: "DELETE",
        headers: getCustomerHeaders(),
        body: JSON.stringify({ leadIds: normalizedLeadIds }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Failed to delete leads");

      setLeads((prev) => prev.filter((lead) => !normalizedLeadIds.includes(String(lead._id))));
      setSelectedLeadIds((prev) => prev.filter((id) => !normalizedLeadIds.includes(String(id))));
      setCount((prev) => Math.max(0, Number(prev || 0) - normalizedLeadIds.length));
    } catch (err) {
      setError(err.message || "Failed to delete leads");
    } finally {
      setDeletingLeadId("");
      setDeletingSelected(false);
    }
  }

  async function handleDeleteCampaign(campaignId) {
    const id = String(campaignId || "");
    if (!id) return;
    const confirmed = window.confirm("Delete this campaign and its tab?");
    if (!confirmed) return;

    setDeletingCampaignId(id);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${id}`, {
        method: "DELETE",
        headers: getCustomerHeaders(),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Failed to delete campaign");

      setCampaigns((prev) => {
        const next = prev.filter((campaign) => String(campaign._id) !== id);
        if (String(selectedCampaignId) === id) {
          const fallbackId = next.length ? String(next[0]._id) : "";
          setSelectedCampaignId(fallbackId);
          router.replace(fallbackId ? `/dashboard/leads?campaignId=${fallbackId}` : "/dashboard/leads");
          if (!fallbackId) {
            setLeads([]);
            setCount(0);
            setSelectedLeadIds([]);
          }
        }
        return next;
      });
    } catch (err) {
      setError(err.message || "Failed to delete campaign");
    } finally {
      setDeletingCampaignId("");
    }
  }

  function openEditLead(lead) {
    const id = String(lead?._id || "");
    if (!id) return;
    const values = {};
    columns.forEach((column) => {
      const rawValue = lead.answers?.[column];
      values[column] = Array.isArray(rawValue) ? rawValue.join(", ") : String(rawValue ?? "");
    });
    setEditingLeadId(id);
    setEditValues(values);
    setError("");
  }

  function closeEditLead() {
    if (savingEdit) return;
    setEditingLeadId("");
    setEditValues({});
  }

  async function handleSaveLeadEdit() {
    if (!selectedCampaignId || !editingLeadId) return;
    setSavingEdit(true);
    setError("");
    try {
      const response = await fetch(`/api/campaigns/${selectedCampaignId}/leads`, {
        method: "PATCH",
        headers: getCustomerHeaders(),
        body: JSON.stringify({
          leadId: editingLeadId,
          answers: editValues,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Failed to update lead");

      setLeads((prev) =>
        prev.map((lead) =>
          String(lead._id) === editingLeadId
            ? {
                ...lead,
                answers: { ...editValues },
              }
            : lead
        )
      );
      closeEditLead();
    } catch (err) {
      setError(err.message || "Failed to update lead");
    } finally {
      setSavingEdit(false);
    }
  }

  const columns = useMemo(() => {
    const keys = new Set();
    const ordered = [];
    (selectedCampaign?.fields || []).forEach(f => {
      const k = String(f.label || f.key).trim();
      if (k && !keys.has(k)) { keys.add(k); ordered.push(k); }
    });
    leads.forEach(l => {
      Object.keys(l.answers || {}).forEach(k => {
        if (!keys.has(k)) { keys.add(k); ordered.push(k); }
      });
    });
    return ordered;
  }, [leads, selectedCampaign]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Leads</h1>
          <p className="mt-2 text-slate-500">Manage and export captured leads from your campaigns.</p>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</span>
            <span className="text-xl font-bold text-slate-900">{count}</span>
          </div>
          <div className="h-8 w-px bg-slate-100" />
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected</span>
            <span className="text-xl font-bold text-indigo-600">{selectedLeadIds.length}</span>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl bg-rose-50 p-4 text-sm font-medium text-rose-700 ring-1 ring-rose-200"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-6 border-b border-slate-200 pb-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {campaigns.map((c) => (
              <div key={c._id} className="group relative">
                <button
                  onClick={() => setSelectedCampaignId(String(c._id))}
                  className={`relative whitespace-nowrap px-4 py-2 pr-10 text-sm font-bold transition-all ${
                    selectedCampaignId === String(c._id) ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {c.name}
                  {selectedCampaignId === String(c._id) && (
                    <motion.div layoutId="campaignTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteCampaign(c._id);
                  }}
                  disabled={deletingCampaignId === String(c._id)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                >
                  {deletingCampaignId === String(c._id) ? "..." : "x"}
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportExcel}
              className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              Export Excel
            </button>
            <button
              onClick={exportPdf}
              className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              Export PDF
            </button>
            <button onClick={() => handleExport("phone")} className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition-colors">Export Phone</button>
            <button onClick={() => handleExport("email")} className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition-colors">Export Email</button>
            <button
              onClick={() => handleDeleteLeads(selectedLeadIds)}
              disabled={!selectedLeadIds.length || deletingSelected || Boolean(deletingLeadId)}
              className="min-w-[140px] rounded-xl !border-rose-900 !bg-rose-700 px-4 py-2 text-xs font-bold !text-white shadow-md hover:!bg-rose-800 transition-colors disabled:opacity-50"
            >
              {deletingSelected ? "Deleting..." : "Delete Selected"}
            </button>
            <button 
              onClick={handleSendToPromotions} disabled={emailSending}
              className="min-w-[150px] rounded-xl !border-indigo-900 !bg-indigo-700 px-4 py-2 text-xs font-bold !text-white shadow-md hover:!bg-indigo-800 transition-colors disabled:opacity-50"
            >
              {emailSending ? "Opening..." : "Send to Promotions"}
            </button>
            <button
              onClick={handleSendToWpSystem}
              disabled={wpSending}
              className="min-w-[160px] rounded-xl !border-emerald-900 !bg-emerald-700 px-4 py-2 text-xs font-bold !text-white shadow-md hover:!bg-emerald-800 transition-colors disabled:opacity-50"
            >
              {wpSending ? "Opening..." : "Send to WP System"}
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div 
            key={selectedCampaignId}
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="px-6 py-4">
                      <input 
                        type="checkbox" checked={allSelected} onChange={toggleSelectAllLeads} 
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600/20"
                      />
                    </th>
                    <th className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-[10px]">Submitted At</th>
                    {columns.map((c) => (
                      <th key={c} className="px-6 py-4 font-bold text-slate-500 uppercase tracking-wider text-[10px]">{c}</th>
                    ))}
                    <th className="px-6 py-4 text-right font-bold text-slate-500 uppercase tracking-wider text-[10px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingLeads ? (
                    <tr><td colSpan={columns.length + 3} className="px-6 py-12 text-center text-slate-400">Loading leads...</td></tr>
                  ) : leads.length === 0 ? (
                    <tr><td colSpan={columns.length + 3} className="px-6 py-12 text-center text-slate-400">No leads found for this campaign.</td></tr>
                  ) : (
                    leads.map((l) => (
                      <tr key={l._id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <input 
                            type="checkbox" checked={selectedLeadSet.has(String(l._id))} onChange={() => toggleLeadSelection(l._id)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600/20"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-medium">
                          {l.submittedAt ? new Date(l.submittedAt).toLocaleString() : "-"}
                        </td>
                        {columns.map((c) => {
                          const val = l.answers?.[c];
                          return (
                            <td key={c} className="px-6 py-4 text-slate-900 font-semibold">
                              {Array.isArray(val) ? val.join(", ") : val || "-"}
                            </td>
                          );
                        })}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditLead(l)}
                              disabled={deletingSelected || deletingLeadId === String(l._id)}
                              className="rounded-lg border border-indigo-700 bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLeads([l._id])}
                              disabled={deletingSelected || deletingLeadId === String(l._id)}
                              className="rounded-lg border border-rose-700 bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
                            >
                              {deletingLeadId === String(l._id) ? "..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {editingLeadId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            >
              <h2 className="text-lg font-bold text-slate-900">Edit Lead</h2>
              <p className="mt-1 text-sm text-slate-500">Update lead field values and save.</p>

              <div className="mt-5 space-y-4">
                {columns.map((column) => (
                  <label key={column} className="block">
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
                      {column}
                    </span>
                    <input
                      type="text"
                      value={editValues[column] ?? ""}
                      onChange={(event) =>
                        setEditValues((prev) => ({
                          ...prev,
                          [column]: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditLead}
                  disabled={savingEdit}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveLeadEdit}
                  disabled={savingEdit}
                  className="rounded-xl border border-indigo-700 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
