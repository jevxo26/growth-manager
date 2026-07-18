"use client";

import { useEffect, useState } from "react";
import { Search, Filter, Loader2, Check, Download, FileText } from "lucide-react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export default function EmailLeadsClient() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, approved: 0, willTakeProduct: 0 });
  const [exporting, setExporting] = useState(false);

  // Filters & Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [isApprovedFilter, setIsApprovedFilter] = useState("all"); // 'all', 'true', 'false'
  const [willTakeProductFilter, setWillTakeProductFilter] = useState("all"); // 'all', 'true', 'false'

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page on new search
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    fetchLeads();
  }, [page, limit, debouncedSearch, isApprovedFilter, willTakeProductFilter]);

  async function fetchLeads() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("limit", limit.toString());

      if (debouncedSearch) params.append("search", debouncedSearch);
      if (isApprovedFilter !== "all") params.append("isApproved", isApprovedFilter);
      if (willTakeProductFilter !== "all") params.append("willTakeProduct", willTakeProductFilter);
      params.append("fetchStats", "true");

      const res = await fetch(`/api/email-leads?${params.toString()}`);
      if (res.ok) {
        const { data } = await res.json();
        setLeads(data?.leads || []);
        setTotal(data?.pagination?.total || 0);
        if (data?.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error("Failed to fetch leads", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id, field, currentValue) {
    // Optimistic update
    setLeads((prev) =>
      prev.map((lead) =>
        lead._id === id ? { ...lead, [field]: !currentValue } : lead
      )
    );

    try {
      const res = await fetch(`/api/email-leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: !currentValue }),
      });

      if (!res.ok) {
        throw new Error("Failed to update");
      }
    } catch (err) {
      console.error(err);
      // Revert on error
      setLeads((prev) =>
        prev.map((lead) =>
          lead._id === id ? { ...lead, [field]: currentValue } : lead
        )
      );
    }
  }

  async function fetchAllFilteredData(additionalParams = {}) {
    const params = new URLSearchParams();
    if (debouncedSearch) params.append("search", debouncedSearch);
    if (isApprovedFilter !== "all") params.append("isApproved", isApprovedFilter);
    if (willTakeProductFilter !== "all") params.append("willTakeProduct", willTakeProductFilter);
    params.append("all", "true"); // Skip pagination

    for (const [key, value] of Object.entries(additionalParams)) {
      params.set(key, value);
    }

    const res = await fetch(`/api/email-leads?${params.toString()}`);
    if (res.ok) {
      const { data } = await res.json();
      return data?.leads || [];
    }
    return [];
  }

  async function exportToExcel() {
    try {
      setExporting(true);
      const allLeads = await fetchAllFilteredData();

      const exportData = allLeads.map((lead) => ({
        "Name": lead.name || "Unknown",
        "Phone": lead.email,
        "Approved": lead.isApproved ? "Yes" : "No",
        "Will Take Product": lead.willTakeProduct ? "Yes" : "No",
        "Sent At": new Date(lead.sentAt).toLocaleString(),
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Email Leads");
      XLSX.writeFile(workbook, "Email_Leads_Export.xlsx");
    } catch (err) {
      console.error("Export to Excel failed", err);
    } finally {
      setExporting(false);
    }
  }

  async function exportOrdersToExcel() {
    try {
      setExporting(true);
      // Specifically fetch leads who will take the product
      const orderLeads = await fetchAllFilteredData({ willTakeProduct: "true" });

      const exportData = orderLeads.map((lead) => ({
        "Name": lead.name || "Unknown",
        "Phone": lead.email,
        "Approved": lead.isApproved ? "Yes" : "No",
        "Will Take Product": lead.willTakeProduct ? "Yes" : "No",
        "Sent At": new Date(lead.sentAt).toLocaleString(),
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Auto-size columns
      const wscols = [
        { wch: 25 }, // Name
        { wch: 15 }, // Phone
        { wch: 12 }, // Approved
        { wch: 20 }, // Will Take Product
        { wch: 25 }  // Sent At
      ];
      worksheet['!cols'] = wscols;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
      XLSX.writeFile(workbook, "Smart_Growth_Manager_Orders.xlsx");
    } catch (err) {
      console.error("Export to Excel failed", err);
    } finally {
      setExporting(false);
    }
  }

  async function exportToPDF() {
    try {
      setExporting(true);
      const pdfLeads = await fetchAllFilteredData({ willTakeProduct: "true" });

      const doc = new jsPDF();

      // Beautiful Header / Branding
      // Primary Brand Color: Indigo-600 (RGB: 79, 70, 229)
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, 210, 40, "F"); // Banner at top

      doc.setFontSize(26);
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.text("Smart Growth Manager", 14, 25);

      doc.setFontSize(14);
      doc.setFont("helvetica", "normal");
      doc.text("Confirmed Orders Report", 14, 34);

      // Metadata section below banner
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(`Report Generated: ${new Date().toLocaleString()}`, 14, 48);

      doc.setFont("helvetica", "bold");
      doc.text(`Total Customers Ordering: ${pdfLeads.length}`, 14, 54);

      // A nice separator line
      doc.setDrawColor(200, 200, 200);
      doc.line(14, 58, 196, 58);

      const tableColumn = ["#", "Customer Name", "Phone Number", "Order Date"];
      const tableRows = [];

      pdfLeads.forEach((lead, index) => {
        const rowData = [
          index + 1,
          lead.name || "Unknown",
          lead.email,
          new Date(lead.sentAt).toLocaleDateString(),
        ];
        tableRows.push(rowData);
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 65,
        theme: "grid",
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: 255,
          fontSize: 11,
          fontStyle: "bold",
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 10,
          textColor: 50,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 15 }, // Index
          1: { halign: 'left', cellWidth: 'auto' }, // Name
          2: { halign: 'center', cellWidth: 40 }, // Phone
          3: { halign: 'center', cellWidth: 40 }, // Date
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252] // Slate-50 for zebra striping
        },
        margin: { top: 60, bottom: 20 },
      });

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Page ${i} of ${pageCount} • Smart Growth Manager CRM`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
      }

      doc.save("Smart_Growth_Manager_Orders.pdf");
    } catch (err) {
      console.error("Export to PDF failed", err);
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Email Leads</h1>
          <p className="text-sm text-slate-500">
            Track and manage people who received your Email promotions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportToExcel}
            disabled={exporting || loading}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Filtered Excel
          </button>
          <button
            onClick={exportOrdersToExcel}
            disabled={exporting || loading}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Orders Excel
          </button>
          <button
            onClick={exportToPDF}
            disabled={exporting || loading}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <FileText className="h-4 w-4" />
            Invoice PDF
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Filtered Total</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm">
          <p className="text-sm font-medium text-indigo-600">Total Approved</p>
          <p className="mt-2 text-3xl font-bold text-indigo-700">{stats.approved}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-5 shadow-sm">
          <p className="text-sm font-medium text-emerald-600">Will Take Product</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{stats.willTakeProduct}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={isApprovedFilter}
            onChange={(e) => { setIsApprovedFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent"
          >
            <option value="all">Approved: All</option>
            <option value="true">Approved: Yes</option>
            <option value="false">Approved: No</option>
          </select>

          <select
            value={willTakeProductFilter}
            onChange={(e) => { setWillTakeProductFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent"
          >
            <option value="all">Will Take Product: All</option>
            <option value="true">Will Take Product: Yes</option>
            <option value="false">Will Take Product: No</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Name & Email</th>
                <th className="px-6 py-4 font-semibold">Sent At</th>
                <th className="px-6 py-4 font-semibold text-center">Approved</th>
                <th className="px-6 py-4 font-semibold text-center">Will Take Product</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && leads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
                    Loading leads...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                    No leads found matching your filters.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={lead._id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">{lead.name || "Unknown"}</div>
                      <div className="text-xs text-slate-500 mt-1">{lead.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                      {new Date(lead.sentAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={lead.isApproved}
                          onChange={() => handleToggle(lead._id, 'isApproved', lead.isApproved)}
                        />
                        <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${lead.isApproved ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
                          {lead.isApproved && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                        </div>
                      </label>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={lead.willTakeProduct}
                          onChange={() => handleToggle(lead._id, 'willTakeProduct', lead.willTakeProduct)}
                        />
                        <div className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${lead.willTakeProduct ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-slate-300'}`}>
                          {lead.willTakeProduct && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                        </div>
                      </label>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 bg-slate-50">
            <span className="text-sm text-slate-500">
              Showing page {page} of {totalPages} ({total} total leads)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-slate-100 transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-slate-100 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
