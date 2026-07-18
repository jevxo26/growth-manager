import connectDB from "@/lib/mongodb";
import { assertTenantContext } from "@/lib/auth-context";
import { assertSubscriptionAccess } from "@/lib/guards";
import { incrementUsage } from "@/lib/usage";
import { apiError, apiOk } from "@/lib/http";
import EmailPromotionJob from "@/models/EmailPromotionJob";
import EmailSmtpSetting from "@/models/EmailSmtpSetting";
import { sendPromoEmail } from "@/lib/email/sendPromoEmail";
import EmailLead from "@/models/EmailLead";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toRichHtmlFromMarkup(text) {
  let html = escapeHtml(text);
  // **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // __underline__
  html = html.replace(/__(.+?)__/g, "<u>$1</u>");
  // *italic*
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return html;
}

function wrapInEmailShell({ subjectHtml, bodyHtml, footerHtml }) {
  return `
<div style="margin:0; padding:24px; background:#f4f6fb; font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:640px; margin:0 auto;">
    <div style="background:#ffffff; border:1px solid #e5e7eb; border-radius:14px; padding:28px; box-shadow:0 8px 24px rgba(15,23,42,0.10);">
      <h1 style="margin:0 0 14px; font-size:22px; color:#0f172a; line-height:1.3;">${subjectHtml}</h1>
      <div style="font-size:15px; color:#1f2937; line-height:1.75;">${bodyHtml}</div>
    </div>
    ${footerHtml ? `<div style="text-align:center; margin-top:16px; font-size:12px; color:#94a3b8;">${footerHtml}</div>` : ""}
  </div>
</div>`.trim();
}

function applyTemplate({ subject, bodyMode, bodyText, templateLink, footerText, name }) {
  let subj = String(subject || "");
  let body = String(bodyText || "");
  const link = String(templateLink || "");

  subj = subj.replaceAll("{{name}}", String(name || ""));
  body = body.replaceAll("{{name}}", String(name || ""));
  body = body.replaceAll("{{link}}", link);

  if (link && !body.includes(link)) {
    body = `${body}\n\n${link}`;
  }

  const safeSubject = escapeHtml(subj.trim() || "Promotion");
  const renderedBodyHtml =
    bodyMode === "html"
      ? body
      : body
          .trim()
          .split("\n")
          .map((line) => toRichHtmlFromMarkup(line.trim()))
          .join("<br/>");
  const renderedFooterHtml = toRichHtmlFromMarkup(String(footerText || "").trim());

  const html = wrapInEmailShell({
    subjectHtml: safeSubject,
    bodyHtml: renderedBodyHtml,
    footerHtml: renderedFooterHtml,
  });

  return { subject: subj.trim(), text: body.trim(), html };
}

export async function POST(request, { params }) {
  const auth = assertTenantContext(request);
  if (auth.error) return apiError(auth.error, auth.status);

  const { id } = await params;
  if (!id) return apiError("job id is required", 400);

  await connectDB();

  const settings = await EmailSmtpSetting.findOne({ companyId: auth.context.companyId });
  if (!settings) {
    return apiError("Configure SMTP in Email Promotions first", 400);
  }

  const job = await EmailPromotionJob.findOne({ _id: id, companyId: auth.context.companyId });
  if (!job) return apiError("Job not found", 404);

  if (job.status !== "running") {
    return apiOk({
      status: job.status,
      currentIndex: job.currentIndex,
      sentCount: job.sentCount,
      total: (job.recipients || []).length,
      lastError: job.lastError,
    });
  }

  const now = new Date();
  if (job.nextRunAt && now.getTime() < job.nextRunAt.getTime()) {
    return apiOk({
      status: "waiting",
      currentIndex: job.currentIndex,
      sentCount: job.sentCount,
      total: (job.recipients || []).length,
      nextRunAt: job.nextRunAt,
    });
  }

  const recipients = job.recipients || [];
  if (job.currentIndex >= recipients.length) {
    job.status = "completed";
    job.nextRunAt = null;
    await job.save();

    return apiOk({
      status: "completed",
      currentIndex: job.currentIndex,
      sentCount: job.sentCount,
      total: recipients.length,
      lastError: job.lastError,
    });
  }

  const recipientIndex = job.currentIndex;
  const recipient = recipients[recipientIndex];

  const access = await assertSubscriptionAccess({
    companyId: auth.context.companyId,
    featureKey: "email_marketing",
    limitKey: "emails_per_month",
    incrementBy: 1,
  });
  if (access.error) {
    job.status = "failed";
    job.lastError = access.error;
    const logEntry = {
      index: recipientIndex,
      name: recipient?.name || "",
      email: recipient?.email,
      status: "failed",
      error: access.error,
      sentAt: now,
    };
    job.sendLogs = Array.isArray(job.sendLogs) ? job.sendLogs : [];
    job.sendLogs.push(logEntry);
    await job.save();
    return apiOk({
      status: "failed",
      currentIndex: job.currentIndex,
      sentCount: job.sentCount,
      total: recipients.length,
      lastError: job.lastError,
      lastLog: logEntry,
    });
  }

  const { subject, text, html } = applyTemplate({
    subject: job.subject,
    bodyMode: job.bodyMode || "text",
    bodyText: job.bodyText,
    templateLink: job.templateLink,
    footerText: job.footerText || "",
    name: recipient?.name,
  });

  try {
    await sendPromoEmail({
      settings,
      to: recipient?.email,
      subject,
      text,
      html,
      attachmentPublicPath: job.attachmentPublicPath || "",
    });

    await incrementUsage(auth.context.companyId, "emails", 1);

    await EmailLead.findOneAndUpdate(
      { companyId: auth.context.companyId, email: recipient?.email },
      { $setOnInsert: { name: recipient?.name, sentAt: now } },
      { upsert: true, new: true }
    );

    job.sentCount += 1;
    job.currentIndex += 1;
    job.lastError = "";

    job.lastRunAt = now;
    const baseInterval = Number(job.intervalSeconds || 5);
    job.nextRunAt = new Date(now.getTime() + baseInterval * 1000);

    const logEntry = {
      index: recipientIndex,
      name: recipient?.name || "",
      email: recipient?.email,
      status: "sent",
      error: "",
      sentAt: now,
    };
    job.sendLogs = Array.isArray(job.sendLogs) ? job.sendLogs : [];
    job.sendLogs.push(logEntry);
    if (job.sendLogs.length > 100) job.sendLogs = job.sendLogs.slice(job.sendLogs.length - 100);

    if (job.currentIndex >= recipients.length) {
      job.status = "completed";
      job.nextRunAt = null;
    }

    await job.save();

    return apiOk({
      status: job.status,
      currentIndex: job.currentIndex,
      sentCount: job.sentCount,
      total: recipients.length,
      nextRunAt: job.nextRunAt,
      lastLog: logEntry,
    });
  } catch (error) {
    job.status = "failed";
    job.lastError = error?.message || "Send failed";
    const logEntry = {
      index: recipientIndex,
      name: recipient?.name || "",
      email: recipient?.email,
      status: "failed",
      error: error?.message || "Send failed",
      sentAt: now,
    };
    job.sendLogs = Array.isArray(job.sendLogs) ? job.sendLogs : [];
    job.sendLogs.push(logEntry);
    await job.save();
    return apiOk({
      status: "failed",
      currentIndex: job.currentIndex,
      sentCount: job.sentCount,
      total: recipients.length,
      lastError: job.lastError,
      lastLog: logEntry,
    });
  }
}
